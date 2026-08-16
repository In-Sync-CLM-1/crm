/**
 * mkt-google-ads-launch — creates and ENABLES a real Google Ads Search
 * campaign from scratch: budget, campaign, geo/language targeting, ad group,
 * keywords, and a Responsive Search Ad. This is the only place that creates
 * NEW Google Ads campaigns (mkt-google-ads-campaign-control only pauses/
 * resumes ones that already exist).
 *
 * Called by mkt-ad-campaign-generator (the autonomous engine) with
 * LLM-written copy already in hand — this function only executes the launch,
 * it does no writing itself. Defaults are deliberately conservative given
 * real money is at stake: Search network only (no Display/Partner reach),
 * "maximize clicks" bidding capped by the daily budget (can't overspend
 * beyond what's configured), phrase-match keywords (narrower than broad),
 * India + English targeting (the brand's whole market).
 *
 * Body: { org_id, customer_id, name, landing_url, daily_budget (INR/day),
 *         launch_date (YYYY-MM-DD), duration_days, headlines[3-15, <=30
 *         chars], descriptions[2-4, <=90 chars], keywords[{text}] }
 * Returns: { campaign_id, budget_id, ad_group_id }
 */
import { loadGoogleAdsConfig, getGoogleAccessToken, mutateGoogleAds, resourceId } from '../_shared/googleAdsClient.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';

function ok(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function err(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

interface LaunchBody {
  org_id: string;
  customer_id: string;
  name: string;
  landing_url: string;
  daily_budget: number;
  launch_date: string;
  duration_days: number;
  headlines: string[];
  descriptions: string[];
  keywords: Array<{ text: string; match_type?: 'PHRASE' | 'EXACT' | 'BROAD' }>;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// India + English — the brand's whole declared market (see BRAND_STORY:
// "Trusted across 8+ industries and 60+ cities in India").
const GEO_INDIA = 'geoTargetConstants/2356';
const LANG_ENGLISH = 'languageConstants/1000';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return err(405, 'POST only');

  try {
    const body = (await req.json()) as LaunchBody;
    const { org_id, customer_id, name, landing_url, daily_budget, launch_date, duration_days } = body;
    if (!org_id || !customer_id || !name || !landing_url || !daily_budget || !launch_date || !duration_days) {
      return err(400, 'org_id, customer_id, name, landing_url, daily_budget, launch_date, duration_days are required');
    }
    const headlines = (body.headlines ?? []).map((h) => h.slice(0, 30)).slice(0, 15);
    const descriptions = (body.descriptions ?? []).map((d) => d.slice(0, 90)).slice(0, 4);
    const keywords = body.keywords ?? [];
    if (headlines.length < 3) return err(400, 'at least 3 headlines required');
    if (descriptions.length < 2) return err(400, 'at least 2 descriptions required');
    if (!keywords.length) return err(400, 'at least 1 keyword required');

    const gAdsConfig = loadGoogleAdsConfig();
    if (!gAdsConfig) return err(500, 'Google Ads credentials not configured');
    const accessToken = await getGoogleAccessToken(gAdsConfig);
    const dt = gAdsConfig.developerToken;
    const cid = customer_id.replace(/-/g, '');
    const endDate = addDays(launch_date, duration_days - 1);

    // 1. Budget
    const budgetRes = await mutateGoogleAds(accessToken, dt, cid, 'campaignBudgets', [{
      create: {
        name: `${name} budget`,
        amountMicros: String(Math.round(daily_budget * 1_000_000)),
        deliveryMethod: 'STANDARD',
      },
    }]);
    const budgetResourceName = budgetRes.results[0].resourceName;

    // 2. Campaign — Search only, maximize-clicks bidding (self-limiting to
    // the daily budget), explicit date-bounded duration.
    const campaignRes = await mutateGoogleAds(accessToken, dt, cid, 'campaigns', [{
      create: {
        name,
        advertisingChannelType: 'SEARCH',
        status: 'ENABLED',
        campaignBudget: budgetResourceName,
        maximizeClicks: {},
        networkSettings: {
          targetGoogleSearch: true,
          targetSearchNetwork: false,
          targetContentNetwork: false,
          targetPartnerSearchNetwork: false,
        },
        startDate: launch_date,
        endDate,
      },
    }]);
    const campaignResourceName = campaignRes.results[0].resourceName;

    // 3. Geo (India) + language (English) targeting.
    await mutateGoogleAds(accessToken, dt, cid, 'campaignCriteria', [
      { create: { campaign: campaignResourceName, location: { geoTargetConstant: GEO_INDIA } } },
      { create: { campaign: campaignResourceName, language: { languageConstant: LANG_ENGLISH } } },
    ]);

    // 4. Ad group
    const adGroupRes = await mutateGoogleAds(accessToken, dt, cid, 'adGroups', [{
      create: {
        name: `${name} ad group`,
        campaign: campaignResourceName,
        status: 'ENABLED',
        type: 'SEARCH_STANDARD',
      },
    }]);
    const adGroupResourceName = adGroupRes.results[0].resourceName;

    // 5. Keywords — phrase match by default (narrower/safer than broad).
    await mutateGoogleAds(accessToken, dt, cid, 'adGroupCriteria', keywords.map((k) => ({
      create: {
        adGroup: adGroupResourceName,
        status: 'ENABLED',
        keyword: { text: k.text, matchType: k.match_type ?? 'PHRASE' },
      },
    })));

    // 6. Responsive Search Ad.
    await mutateGoogleAds(accessToken, dt, cid, 'adGroupAds', [{
      create: {
        adGroup: adGroupResourceName,
        status: 'ENABLED',
        ad: {
          finalUrls: [landing_url],
          responsiveSearchAd: {
            headlines: headlines.map((text) => ({ text })),
            descriptions: descriptions.map((text) => ({ text })),
          },
        },
      },
    }]);

    return ok({
      success: true,
      campaign_id: resourceId(campaignResourceName),
      budget_id: resourceId(budgetResourceName),
      ad_group_id: resourceId(adGroupResourceName),
      start_date: launch_date,
      end_date: endDate,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[google-ads-launch] fatal:', msg);
    return err(500, msg);
  }
});
