// Lets a human pause/resume a running Google Ads campaign from inside crm —
// the "intervene" half of "autonomous but with a human eye watching." The sync
// function (mkt-google-ads-sync) is read-only; this is the only place that
// writes back to Google Ads.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getGoogleAccessToken(): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_ADS_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_ADS_CLIENT_SECRET')!,
      refresh_token: Deno.env.get('GOOGLE_ADS_REFRESH_TOKEN')!,
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) throw new Error(`Google OAuth error: ${await response.text()}`);
  const data = await response.json();
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No Authorization header provided');
    const token = authHeader.replace('Bearer ', '');

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
    if (userError || !user) throw new Error('Authentication failed');

    const { campaign_row_id, action } = await req.json();
    if (!campaign_row_id || !['pause', 'enable'].includes(action)) {
      return new Response(JSON.stringify({ error: 'campaign_row_id and action (pause|enable) are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabaseClient();
    const { data: campaign, error: campaignErr } = await supabase
      .from('mkt_google_ads_campaigns')
      .select('id, org_id, google_campaign_id, account_id, name')
      .eq('id', campaign_row_id)
      .single();
    if (campaignErr || !campaign) throw new Error('Campaign not found');

    // Confirm the caller belongs to the campaign's org.
    const { data: profile } = await supabaseAuth.from('profiles').select('org_id').eq('id', user.id).single();
    if (!profile || profile.org_id !== campaign.org_id) throw new Error('Not authorized for this campaign');

    const accessToken = await getGoogleAccessToken();
    const developerToken = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN')!;
    const loginCustomerId = Deno.env.get('GOOGLE_ADS_LOGIN_CUSTOMER_ID')?.replace(/-/g, '');
    const customerId = campaign.account_id.replace(/-/g, '');
    const googleStatus = action === 'pause' ? 'PAUSED' : 'ENABLED';

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
    };
    if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;

    const mutateRes = await fetch(
      `https://googleads.googleapis.com/v21/customers/${customerId}/campaigns:mutate`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          operations: [{
            updateMask: 'status',
            update: {
              resourceName: `customers/${customerId}/campaigns/${campaign.google_campaign_id}`,
              status: googleStatus,
            },
          }],
        }),
      },
    );

    if (!mutateRes.ok) {
      const errText = await mutateRes.text();
      return new Response(JSON.stringify({ error: `Google Ads API error: ${errText}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await supabase.from('mkt_google_ads_campaigns').update({ status: googleStatus }).eq('id', campaign_row_id);

    return new Response(JSON.stringify({ success: true, campaign: campaign.name, status: googleStatus }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[mkt-google-ads-campaign-control] error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
