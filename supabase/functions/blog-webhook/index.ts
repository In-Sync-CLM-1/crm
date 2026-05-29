import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BlogPostPayload {
  org_id: string;
  blog_url: string;
  blog_title: string;
  blog_excerpt?: string;
  featured_image_url?: string;
  publish_date?: string;
  status: string;
  social_posted: boolean;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = `req_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  console.log('=== BLOG WEBHOOK REQUEST START ===', requestId);

  try {
    // Parse payload
    const payload: BlogPostPayload = await req.json();
    console.log('Received payload:', { ...payload, request_id: requestId });

    // Validate required fields
    const errors = validatePayload(payload);
    if (errors.length > 0) {
      console.error('Validation errors:', errors);
      return errorResponse(400, `Validation failed: ${errors.join(', ')}`, requestId);
    }

    // Initialize Supabase client with service role
    const supabase = getSupabaseClient();

    // Verify organization exists
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', payload.org_id)
      .single();

    if (orgError || !org) {
      console.error('Organization not found:', payload.org_id, orgError);
      return errorResponse(404, 'Organization not found', requestId);
    }

    console.log('Organization validated:', org.name);

    // Insert blog post (trigger will fire automatically)
    const { data: blogPost, error: insertError } = await supabase
      .from('blog_posts')
      .insert({
        org_id: payload.org_id,
        blog_url: payload.blog_url,
        blog_title: payload.blog_title,
        blog_excerpt: payload.blog_excerpt || null,
        featured_image_url: payload.featured_image_url || null,
        publish_date: payload.publish_date || new Date().toISOString().split('T')[0],
        status: payload.status,
        social_posted: payload.social_posted,
        posted_timestamp: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('Database insert error:', insertError);
      return errorResponse(500, `Database error: ${insertError.message}`, requestId);
    }

    console.log('Blog post created:', blogPost.id);
    console.log('Campaign ID (set by trigger):', blogPost.campaign_id);
    console.log('=== BLOG WEBHOOK REQUEST SUCCESS ===', requestId);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Blog post created and email campaign initiated',
        blog_post_id: blogPost.id,
        campaign_id: blogPost.campaign_id,
        request_id: requestId,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('=== BLOG WEBHOOK ERROR ===', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(500, `Internal server error: ${errorMessage}`, requestId);
  }
});

function validatePayload(payload: any): string[] {
  const errors: string[] = [];

  // Required fields
  if (!payload.org_id) {
    errors.push('Missing required field: org_id');
  } else if (!isValidUUID(payload.org_id)) {
    errors.push('org_id must be a valid UUID');
  }

  if (!payload.blog_url) {
    errors.push('Missing required field: blog_url');
  } else if (!isValidUrl(payload.blog_url)) {
    errors.push('blog_url must be a valid URL');
  }

  if (!payload.blog_title) {
    errors.push('Missing required field: blog_title');
  } else if (payload.blog_title.length > 500) {
    errors.push('blog_title must be less than 500 characters');
  }

  if (!payload.status) {
    errors.push('Missing required field: status');
  } else if (payload.status !== 'posted') {
    errors.push('status must be "posted" to trigger email campaign');
  }

  if (payload.social_posted !== true) {
    errors.push('social_posted must be true to trigger email campaign');
  }

  // Optional field validation
  if (payload.blog_excerpt && payload.blog_excerpt.length > 1000) {
    errors.push('blog_excerpt must be less than 1000 characters');
  }

  if (payload.featured_image_url && !isValidUrl(payload.featured_image_url)) {
    errors.push('featured_image_url must be a valid URL');
  }

  if (payload.publish_date && !isValidDate(payload.publish_date)) {
    errors.push('publish_date must be in YYYY-MM-DD format');
  }

  return errors;
}

function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function isValidDate(dateStr: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) return false;

  const date = new Date(dateStr);
  return date instanceof Date && !isNaN(date.getTime());
}

function errorResponse(status: number, message: string, requestId?: string) {
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
      request_id: requestId,
      timestamp: new Date().toISOString(),
    }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}
