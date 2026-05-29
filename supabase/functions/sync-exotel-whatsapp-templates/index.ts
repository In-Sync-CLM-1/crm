import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATE_LIMIT_SYNCS_PER_HOUR = 3;

// Check rate limit for template syncs
async function checkSyncRateLimit(supabaseClient: any, orgId: string): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  const { count } = await supabaseClient
    .from('rate_limit_log')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('operation', 'sync_whatsapp_templates')
    .gte('created_at', oneHourAgo);
  
  return (count || 0) < RATE_LIMIT_SYNCS_PER_HOUR;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== sync-exotel-whatsapp-templates Started ===');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No Authorization header provided');
    }

    const token = authHeader.replace('Bearer ', '');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      throw new Error('Authentication failed');
    }

    // Get user's org_id
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();

    if (!profile?.org_id) {
      throw new Error('Organization not found');
    }

    const orgId = profile.org_id;

    // Check rate limit
    const withinLimit = await checkSyncRateLimit(supabaseClient, orgId);
    if (!withinLimit) {
      return new Response(
        JSON.stringify({ 
          status: 'rate_limited',
          message: 'Template sync rate limit exceeded. Please wait an hour before syncing again.'
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Exotel settings
    const { data: exotelSettings } = await supabaseClient
      .from('exotel_settings')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .eq('whatsapp_enabled', true)
      .single();

    if (!exotelSettings) {
      return new Response(
        JSON.stringify({ error: 'Exotel WhatsApp not configured' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!exotelSettings.waba_id) {
      return new Response(
        JSON.stringify({ error: 'WABA ID not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log rate limit
    const serviceClient = getSupabaseClient();
    await serviceClient.from('rate_limit_log').insert({
      org_id: orgId,
      user_id: user.id,
      operation: 'sync_whatsapp_templates',
    });

    // Fetch templates from Exotel API - Using v2 endpoint
    const exotelUrl = `https://${exotelSettings.api_key}:${exotelSettings.api_token}@${exotelSettings.subdomain}/v2/accounts/${exotelSettings.account_sid}/templates?waba_id=${exotelSettings.waba_id}&limit=100`;

    console.log('Fetching templates from Exotel...');

    const exotelResponse = await fetch(exotelUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!exotelResponse.ok) {
      const errorText = await exotelResponse.text();
      console.error('Exotel API error response:', {
        status: exotelResponse.status,
        statusText: exotelResponse.statusText,
        body: errorText,
        url: exotelUrl.replace(exotelSettings.api_token, '***') // Mask token in logs
      });
      throw new Error(`Failed to fetch templates from Exotel: ${exotelResponse.status} - ${errorText}`);
    }

    const exotelResult = await exotelResponse.json();
    console.log('Exotel templates response:', JSON.stringify(exotelResult, null, 2));

    const templates = exotelResult?.response?.whatsapp?.templates || [];
    let syncedCount = 0;
    let failedCount = 0;

    for (const templateWrapper of templates) {
      const template = templateWrapper.data;
      if (!template || templateWrapper.code !== 200) {
        failedCount++;
        continue;
      }

      try {
        // Extract components
        const headerComponent = template.components?.find((c: any) => c.type === 'HEADER');
        const bodyComponent = template.components?.find((c: any) => c.type === 'BODY');
        const footerComponent = template.components?.find((c: any) => c.type === 'FOOTER');
        const buttonsComponent = template.components?.find((c: any) => c.type === 'BUTTONS');

        // Extract variables from body text
        const bodyText = bodyComponent?.text || '';
        const variables = bodyText.match(/\{\{[^}]+\}\}/g) || [];

        // Map Exotel status to our status
        let status = 'pending';
        if (template.status === 'APPROVED') status = 'approved';
        else if (template.status === 'REJECTED') status = 'rejected';
        else if (template.status === 'PENDING') status = 'pending';

        // Upsert template
        const { error: upsertError } = await serviceClient
          .from('communication_templates')
          .upsert({
            org_id: orgId,
            template_id: template.id || template.name,
            template_name: template.name,
            template_type: 'whatsapp',
            content: bodyText,
            category: template.category?.toLowerCase() || 'utility',
            language: template.language || 'en',
            status: status,
            submission_status: status,
            header_type: headerComponent?.format?.toLowerCase() || null,
            header_content: headerComponent?.text || null,
            footer_text: footerComponent?.text || null,
            buttons: buttonsComponent?.buttons || null,
            variables: variables,
            rejection_reason: template.rejected_reason !== 'NONE' ? template.rejected_reason : null,
            last_synced_at: new Date().toISOString(),
          }, { onConflict: 'org_id,template_id' });

        if (upsertError) {
          console.error('Error upserting template:', template.name, upsertError);
          failedCount++;
        } else {
          syncedCount++;
        }
      } catch (err) {
        console.error('Error processing template:', template.name, err);
        failedCount++;
      }
    }

    console.log(`Synced ${syncedCount} templates, ${failedCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: syncedCount,
        failed: failedCount,
        total: templates.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error syncing templates:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});