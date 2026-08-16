/**
 * mkt-ad-campaign-pause — the human-intervention control for the autonomous
 * ad engine's live campaigns (the "Human can intervene" half). Works on
 * either channel's mkt_ad_campaigns row: pauses the real campaign on Google
 * Ads or Meta, then marks the row 'paused' so mkt-ad-campaign-generator
 * treats the channel as free again on its next cycle (a paused campaign is
 * not 'active', so a fresh one can be generated once budget allows).
 *
 * Body: { campaign_id (mkt_ad_campaigns.id) }
 */
import { loadGoogleAdsConfig, getGoogleAccessToken, mutateGoogleAds } from '../_shared/googleAdsClient.ts';
import { FB_API_VERSION } from '../_shared/metaAds.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

function ok(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function err(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return err(405, 'POST only');

  const supabase = getSupabaseClient();

  try {
    const { campaign_id } = await req.json();
    if (!campaign_id) return err(400, 'campaign_id required');

    const { data: campaign, error: campErr } = await supabase
      .from('mkt_ad_campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single();
    if (campErr || !campaign) return err(404, 'campaign not found');
    if (campaign.status !== 'active') return ok({ skip: `campaign is already ${campaign.status}` });

    if (campaign.channel === 'google') {
      const cfg = loadGoogleAdsConfig();
      if (!cfg) return err(500, 'Google Ads credentials not configured');
      const accessToken = await getGoogleAccessToken(cfg);
      await mutateGoogleAds(accessToken, cfg.developerToken, campaign.google_customer_id ?? '', 'campaigns', [{
        updateMask: 'status',
        update: { resourceName: `customers/${campaign.google_customer_id}/campaigns/${campaign.google_campaign_id}`, status: 'PAUSED' },
      }]);
    } else {
      const { data: config } = await supabase
        .from('mkt_social_config')
        .select('fb_page_access_token')
        .eq('org_id', campaign.org_id)
        .eq('active', true)
        .maybeSingle();
      if (!config) return err(400, 'no active mkt_social_config for this org');
      const res = await fetch(`https://graph.facebook.com/${FB_API_VERSION}/${campaign.meta_campaign_id}`, {
        method: 'POST',
        body: new URLSearchParams({ status: 'PAUSED', access_token: config.fb_page_access_token as string }),
        signal: AbortSignal.timeout(30_000),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(`FB Graph API ${res.status}: ${JSON.stringify(json)}`);
    }

    await supabase.from('mkt_ad_campaigns').update({ status: 'paused' }).eq('id', campaign_id);
    return ok({ success: true, campaign: campaign.name, status: 'paused' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[ad-campaign-pause] fatal:', msg);
    return err(500, msg);
  }
});
