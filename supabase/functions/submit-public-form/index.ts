import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface FormSubmission {
  formId: string;
  orgId: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  customFields: Record<string, string>;
  honeypot?: string; // Bot detection field
  submissionTime?: number; // Time taken to fill form
}

// In-memory rate limiting by IP (per-instance)
const rateLimitMap = new Map<string, { count: number; resetTime: number; submissions: number[] }>();

// Rate limit: 3 submissions per 5 minutes per IP
const MAX_SUBMISSIONS_PER_WINDOW = 3;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// Minimum time to fill form (bot detection)
const MIN_FORM_FILL_TIME_MS = 3000; // 3 seconds

function getClientIP(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
    || req.headers.get('cf-connecting-ip') 
    || 'unknown';
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const key = `form_submit:${ip}`;
  
  const current = rateLimitMap.get(key);
  
  if (!current || now > current.resetTime) {
    rateLimitMap.set(key, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
      submissions: [now],
    });
    return { allowed: true };
  }
  
  // Remove submissions older than the window
  current.submissions = current.submissions.filter(time => time > now - RATE_LIMIT_WINDOW_MS);
  
  if (current.submissions.length >= MAX_SUBMISSIONS_PER_WINDOW) {
    const oldestSubmission = Math.min(...current.submissions);
    const retryAfter = Math.ceil((oldestSubmission + RATE_LIMIT_WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter };
  }
  
  current.submissions.push(now);
  current.count = current.submissions.length;
  
  return { allowed: true };
}

function validateInput(data: FormSubmission): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check required fields
  if (!data.formId || data.formId.length > 100) {
    errors.push('Invalid form ID');
  }
  
  if (!data.orgId || data.orgId.length > 100) {
    errors.push('Invalid organization ID');
  }
  
  if (!data.firstName || data.firstName.trim().length === 0) {
    errors.push('First name is required');
  }
  
  if (data.firstName && data.firstName.length > 100) {
    errors.push('First name too long (max 100 characters)');
  }
  
  if (data.lastName && data.lastName.length > 100) {
    errors.push('Last name too long (max 100 characters)');
  }
  
  // Email validation
  if (data.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email) || data.email.length > 255) {
      errors.push('Invalid email address');
    }
  }
  
  // Phone validation
  if (data.phone && data.phone.length > 20) {
    errors.push('Invalid phone number');
  }
  
  // Bot detection: honeypot field should be empty
  if (data.honeypot && data.honeypot.trim().length > 0) {
    errors.push('Bot detected');
  }
  
  // Bot detection: form should take at least MIN_FORM_FILL_TIME_MS to fill
  if (data.submissionTime && data.submissionTime < MIN_FORM_FILL_TIME_MS) {
    errors.push('Submission too fast');
  }
  
  // Validate custom fields
  if (data.customFields) {
    Object.entries(data.customFields).forEach(([key, value]) => {
      if (key.length > 100) {
        errors.push(`Custom field key too long: ${key}`);
      }
      if (typeof value === 'string' && value.length > 5000) {
        errors.push(`Custom field value too long: ${key}`);
      }
    });
    
    if (Object.keys(data.customFields).length > 50) {
      errors.push('Too many custom fields (max 50)');
    }
  }
  
  return { valid: errors.length === 0, errors };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get client IP for rate limiting
    const clientIP = getClientIP(req);
    console.log(`Form submission from IP: ${clientIP}`);
    
    // Check rate limit
    const rateLimitCheck = checkRateLimit(clientIP);
    if (!rateLimitCheck.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded',
          message: `Too many form submissions. Please try again in ${rateLimitCheck.retryAfter} seconds.`,
          retryAfter: rateLimitCheck.retryAfter
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const data = await req.json() as FormSubmission;
    
    // Validate input
    const validation = validateInput(data);
    if (!validation.valid) {
      console.log(`Validation failed: ${validation.errors.join(', ')}`);
      return new Response(
        JSON.stringify({ 
          error: 'Validation failed',
          message: 'Invalid form data',
          details: validation.errors
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role (bypasses RLS)
    const supabaseAdmin = getSupabaseClient();

    // Verify form exists and is active
    const { data: form, error: formError } = await supabaseAdmin
      .from('forms')
      .select('id, org_id')
      .eq('id', data.formId)
      .eq('is_active', true)
      .single();

    if (formError || !form) {
      console.log(`Form not found or inactive: ${data.formId}`);
      return new Response(
        JSON.stringify({ error: 'Form not found or inactive' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify org_id matches
    if (form.org_id !== data.orgId) {
      console.log(`Org ID mismatch: ${form.org_id} !== ${data.orgId}`);
      return new Response(
        JSON.stringify({ error: 'Invalid organization' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the "New" pipeline stage for this org
    const { data: newStage } = await supabaseAdmin
      .from('pipeline_stages')
      .select('id')
      .eq('org_id', data.orgId)
      .ilike('name', 'new')
      .single();

    // Insert contact with pipeline stage set to "New"
    const { data: contact, error: contactError } = await supabaseAdmin
      .from('contacts')
      .insert({
        first_name: data.firstName.trim(),
        last_name: data.lastName?.trim() || null,
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        status: 'new',
        source: 'web_form',
        org_id: data.orgId,
        pipeline_stage_id: newStage?.id || null,
      })
      .select()
      .single();

    if (contactError || !contact) {
      console.error('Contact insert error:', contactError);
      return new Response(
        JSON.stringify({ error: 'Failed to create contact' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert custom fields if any
    if (data.customFields && Object.keys(data.customFields).length > 0) {
      const customFieldsData = Object.entries(data.customFields).map(([fieldId, value]) => ({
        contact_id: contact.id,
        custom_field_id: fieldId,
        field_value: String(value).substring(0, 5000), // Enforce max length
      }));

      const { error: customFieldsError } = await supabaseAdmin
        .from('contact_custom_fields')
        .insert(customFieldsData);

      if (customFieldsError) {
        console.error('Custom fields insert error:', customFieldsError);
        // Don't fail the request, just log the error
      }
    }

    console.log(`Form submitted successfully: contact ${contact.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Form submitted successfully',
        contactId: contact.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Form submission error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
