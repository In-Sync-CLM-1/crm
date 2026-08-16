/**
 * mkt-meta-ads-launch — creates and ACTIVATES a real, standalone Meta ad
 * campaign (Campaign -> Ad Set -> Ad Creative -> Ad) from AI-written copy +
 * an image, rather than boosting an existing organic post (that's
 * mkt-social-boost's job). Same Graph API pattern/auth as mkt-social-boost,
 * extended with a fresh object_story_spec creative instead of object_story_id.
 *
 * Stays BLOCKED (same as mkt-social-boost) until mkt_social_config.
 * fb_ad_account_id is set — needs a Meta Ads account with a payment method
 * linked in Business Manager, an interactive step outside API reach.
 *
 * Body: { org_id, name, landing_url, daily_budget (INR/day), launch_date
 *         (YYYY-MM-DD), duration_days, primary_text, headline, image_url,
 *         targeting_interests?: string[] }
 * Returns: { campaign_id, adset_id, ad_id }
 */
import { DEFAULT_INTERESTS, fbPost } from '../_shared/metaAds.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

function ok(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function err(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface LaunchBody {
  org_id: string;
  name: string;
  landing_url: string;
  daily_budget: number;
  launch_date: string;
  duration_days: number;
  primary_text: string;
  headline: string;
  image_url: string;
  targeting_interests?: { id: string; name: string }[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return err(405, 'POST only');

  const supabase = getSupabaseClient();

  try {
    const body = (await req.json()) as LaunchBody;
    const { org_id, name, landing_url, daily_budget, launch_date, duration_days, primary_text, headline, image_url } = body;
    if (!org_id || !name || !landing_url || !daily_budget || !launch_date || !duration_days || !primary_text || !headline || !image_url) {
      return err(400, 'org_id, name, landing_url, daily_budget, launch_date, duration_days, primary_text, headline, image_url are required');
    }

    const { data: config } = await supabase
      .from('mkt_social_config')
      .select('fb_page_id, fb_page_access_token, fb_ad_account_id')
      .eq('org_id', org_id)
      .eq('active', true)
      .maybeSingle();
    if (!config) return err(400, 'no active mkt_social_config for this org');
    if (!config.fb_ad_account_id) {
      return ok({ blocked: true, reason: 'No Meta Ads account linked (mkt_social_config.fb_ad_account_id is empty) — link one with a payment method in Business Manager first.' });
    }

    const token = config.fb_page_access_token as string;
    const actId = `act_${config.fb_ad_account_id}`;
    const startTime = new Date(Date.now() + 5 * 60_000).toISOString();
    const endTime = `${addDays(launch_date, duration_days)}T00:00:00+0000`;
    const interests = body.targeting_interests?.length ? body.targeting_interests : DEFAULT_INTERESTS;

    const campaign = await fbPost(`${actId}/campaigns`, token, {
      name,
      objective: 'OUTCOME_TRAFFIC',
      status: 'ACTIVE',
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false,
    });

    const adset = await fbPost(`${actId}/adsets`, token, {
      name: `${name} adset`,
      campaign_id: campaign.id,
      daily_budget: Math.round(daily_budget * 100), // INR -> paise
      billing_event: 'LINK_CLICKS',
      optimization_goal: 'LINK_CLICKS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      start_time: startTime,
      end_time: endTime,
      targeting: {
        geo_locations: { countries: ['IN'] },
        age_min: 25,
        age_max: 55,
        flexible_spec: [{ interests }],
        publisher_platforms: ['facebook', 'instagram'],
        targeting_automation: { advantage_audience: 0 },
      },
      status: 'ACTIVE',
    });

    const creative = await fbPost(`${actId}/adcreatives`, token, {
      object_story_spec: {
        page_id: config.fb_page_id,
        link_data: {
          message: primary_text,
          link: landing_url,
          name: headline,
          picture: image_url,
        },
      },
    });

    const ad = await fbPost(`${actId}/ads`, token, {
      name: `${name} ad`,
      adset_id: adset.id,
      creative: { creative_id: creative.id },
      status: 'ACTIVE',
    });

    return ok({
      success: true,
      campaign_id: campaign.id as string,
      adset_id: adset.id as string,
      ad_id: ad.id as string,
      start_date: launch_date,
      end_date: addDays(launch_date, duration_days - 1),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[meta-ads-launch] fatal:', msg);
    return err(500, msg);
  }
});
