import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface QueueItem {
  operation: string;
  data: any;
  priority: number;
}

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

// In-memory rate limiting (per-instance)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Operation-specific rate limits
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'contact_import': { maxRequests: 5, windowMs: 60000 }, // 5 imports per minute
  'bulk_contact_create': { maxRequests: 10, windowMs: 60000 }, // 10 bulk creates per minute
  'form_submit': { maxRequests: 20, windowMs: 60000 }, // 20 form submits per minute
  'contact_create': { maxRequests: 50, windowMs: 60000 }, // 50 contact creates per minute
};

// Batch processing limits
const BATCH_LIMITS: Record<string, number> = {
  'contact_import': 100, // Process 100 contacts at a time
  'bulk_contact_create': 50, // Process 50 contacts at a time
};

// Maximum total items per operation
const MAX_ITEMS_PER_OPERATION: Record<string, number> = {
  'contact_import': 10000, // Max 10k contacts per import
  'bulk_contact_create': 10000, // Max 10k contacts per bulk create
  'form_submit': 1, // Only 1 form submit at a time
  'contact_create': 1, // Only 1 contact create at a time
};

function checkRateLimit(userId: string, operation: string): boolean {
  const config = RATE_LIMITS[operation] || { maxRequests: 100, windowMs: 60000 };
  const key = `${userId}:${operation}`;
  const now = Date.now();
  
  const current = rateLimitMap.get(key);
  
  if (!current || now > current.resetTime) {
    rateLimitMap.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return true;
  }
  
  if (current.count >= config.maxRequests) {
    return false;
  }
  
  current.count++;
  return true;
}

async function processBatch(
  supabase: any,
  operation: string,
  items: any[],
  userId: string,
  orgId: string
): Promise<{ processed: number; errors: number }> {
  const batchSize = BATCH_LIMITS[operation] || 50;
  let processed = 0;
  let errors = 0;

  // Process in chunks
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    
    try {
      if (operation === 'contact_import' || operation === 'bulk_contact_create') {
        // Validate and prepare contacts
        const contacts = chunk.map(contact => ({
          first_name: contact.first_name,
          last_name: contact.last_name || null,
          email: contact.email || null,
          phone: contact.phone || null,
          company: contact.company || null,
          job_title: contact.job_title || null,
          status: contact.status || 'new',
          source: contact.source || 'import',
          org_id: orgId,
          created_by: userId,
        })).filter(c => c.first_name); // Only keep valid contacts

        const { error } = await supabase
          .from('contacts')
          .insert(contacts);

        if (error) {
          console.error(`Batch ${i / batchSize + 1} error:`, error);
          errors += chunk.length;
        } else {
          processed += contacts.length;
        }
      }
    } catch (error) {
      console.error(`Batch processing error:`, error);
      errors += chunk.length;
    }

    // Small delay between batches to prevent overwhelming the database
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return { processed, errors };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's org_id
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) {
      return new Response(
        JSON.stringify({ error: 'Organization not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { operation, data: items, priority = 5 } = await req.json() as QueueItem

    console.log(`Queue request: ${operation} from user ${user.id}, ${items?.length || 0} items`)

    // Validate item count against maximum
    const maxItems = MAX_ITEMS_PER_OPERATION[operation] || 10000
    if (items && items.length > maxItems) {
      return new Response(
        JSON.stringify({ 
          error: 'Item limit exceeded',
          message: `Maximum ${maxItems} items allowed per ${operation} operation. You submitted ${items.length} items.`,
          maxItems,
          submitted: items.length
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check rate limit
    if (!checkRateLimit(user.id, operation)) {
      const config = RATE_LIMITS[operation] || { maxRequests: 100, windowMs: 60000 };
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded',
          message: `Maximum ${config.maxRequests} ${operation} operations per ${config.windowMs / 1000} seconds`,
          retryAfter: Math.ceil(config.windowMs / 1000)
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate operation
    if (!['contact_import', 'bulk_contact_create', 'form_submit', 'contact_create'].includes(operation)) {
      return new Response(
        JSON.stringify({ error: 'Invalid operation' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Process the batch
    const result = await processBatch(
      supabaseClient,
      operation,
      items,
      user.id,
      profile.org_id
    )

    console.log(`Queue result: processed ${result.processed}, errors ${result.errors}`)

    return new Response(
      JSON.stringify({
        success: true,
        operation,
        processed: result.processed,
        errors: result.errors,
        total: items.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Queue manager error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
