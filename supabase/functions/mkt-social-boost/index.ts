/**
 * mkt-social-boost — Weekly Meta (Facebook/Instagram) post boost.
 *
 * Picks the single best-performing Facebook or Instagram post from the
 * last 7 days (by total interactions, reach as tiebreaker) and boosts it
 * via the Marketing API: Campaign -> Ad Set -> Ad against the EXISTING
 * organic post (object_story_id), so the boost carries its real likes/
 * comments rather than starting a new ad-only post.
 *
 * Budget comes from mkt_engine_config.boost_settings (₹200/day x 4 days,
 * ₹800/week cap as of 2026-07-19 — raise these values to scale up).
 * One boost per calendar week (org_id, week_start) is unique in
 * mkt_boost_history, so re-runs within the same week are a no-op.
 *
 * Stays BLOCKED until mkt_social_config.fb_ad_account_id is set — that
 * requires a Meta Ads account with a payment method linked in Business
 * Manager (interactive, outside API reach) and a token carrying
 * ads_management scope for that account.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import {
  buildTargeting,
  describeMetaError,
  fbDelete,
  fbPost,
  resolveInterests,
} from '../_shared/metaAds.ts';

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function err(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// IST calendar week (Mon-Sun), matching the weekly cadence in the growth plan.
function weekStartIST(d: Date): string {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const day = ist.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? 6 : day - 1;
  ist.setUTCDate(ist.getUTCDate() - diffToMonday);
  return ist.toISOString().slice(0, 10);
}

interface Candidate {
  post_id: string;
  channel: 'facebook' | 'instagram';
  fb_post_id: string | null;
  interactions: number;
  reach: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { data: config } = await supabase
      .from('mkt_social_config')
      .select('org_id, fb_page_id, fb_page_access_token, fb_ad_account_id')
      .eq('active', true)
      .maybeSingle();

    if (!config) return ok({ skip: 'no active mkt_social_config' });

    const now = new Date();
    const weekStart = weekStartIST(now);

    // Only a boost that actually got off the ground blocks a retry. A row
    // left behind by a failed/blocked attempt must NOT burn the whole week —
    // it gets overwritten by the next run instead.
    const { data: existing } = await supabase
      .from('mkt_boost_history')
      .select('id, status')
      .eq('org_id', config.org_id)
      .eq('week_start', weekStart)
      .maybeSingle();
    if (existing && ['active', 'completed'].includes(existing.status)) {
      return ok({ skip: 'already boosted this week', status: existing.status });
    }

    const { data: settingsRow } = await supabase
      .from('mkt_engine_config')
      .select('config_value')
      .eq('org_id', config.org_id)
      .eq('config_key', 'boost_settings')
      .maybeSingle();
    const settings = (settingsRow?.config_value as Record<string, number>) ?? {
      daily_budget_paise: 20000,
      days: 4,
      weekly_cap_paise: 80000,
    };

    // Best post of the last 7 days across Facebook + Instagram.
    const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: posts } = await supabase
      .from('blog_posts')
      .select('id, fb_post_id, fb_likes, fb_comments, fb_shares, ig_post_id, ig_likes, ig_comments, ig_saves, ig_shares, ig_reach')
      .eq('org_id', config.org_id)
      .eq('status', 'posted')
      .gte('publish_date', since);

    const n = (v: number | null) => v ?? 0;
    const candidates: Candidate[] = [];
    for (const p of posts ?? []) {
      if (p.fb_post_id) {
        candidates.push({
          post_id: p.id,
          channel: 'facebook',
          fb_post_id: p.fb_post_id,
          interactions: n(p.fb_likes) + n(p.fb_comments) + n(p.fb_shares),
          reach: 0,
        });
      }
      if (p.ig_post_id) {
        candidates.push({
          post_id: p.id,
          channel: 'instagram',
          fb_post_id: p.ig_post_id,
          interactions: n(p.ig_likes) + n(p.ig_comments) + n(p.ig_saves) + n(p.ig_shares),
          reach: n(p.ig_reach),
        });
      }
    }
    candidates.sort((a, b) => b.interactions - a.interactions || b.reach - a.reach);
    const best = candidates[0];

    const startDate = now.toISOString().slice(0, 10);
    const endDate = new Date(now.getTime() + settings.days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    /**
     * Every outcome writes a history row — including the failures.
     *
     * The old code returned early (no candidate) or threw (Graph error)
     * without recording anything, so a broken boost was invisible on every
     * screen and in every log. That is exactly how this function managed to
     * fail weekly from 2026-08-03 to 2026-08-14 with nobody noticing.
     * Upsert, because (org_id, week_start) is unique and a retry inside the
     * same week must overwrite the previous failed attempt.
     */
    const record = (
      status: 'active' | 'failed' | 'blocked',
      extra: Record<string, unknown> = {},
    ) =>
      supabase.from('mkt_boost_history').upsert(
        {
          org_id: config.org_id,
          channel: best?.channel ?? 'facebook',
          source_post_id: best?.post_id ?? null,
          fb_post_id: best?.fb_post_id ?? null,
          daily_budget_paise: settings.daily_budget_paise,
          total_budget_paise: settings.daily_budget_paise * settings.days,
          days: settings.days,
          week_start: weekStart,
          start_date: startDate,
          end_date: endDate,
          status,
          error: null,
          campaign_id: null,
          adset_id: null,
          ad_id: null,
          updated_at: new Date().toISOString(),
          ...extra,
        },
        { onConflict: 'org_id,week_start' },
      );

    if (!best) {
      await record('blocked', {
        error: 'No eligible Facebook/Instagram post in the last 7 days — nothing to boost.',
      });
      return ok({ blocked: true, reason: 'no eligible post in the last 7 days' });
    }

    // Not wired to real spend until an ad account is linked (Business
    // Manager step — see mkt_social_config.fb_ad_account_id).
    if (!config.fb_ad_account_id) {
      await record('blocked', {
        error:
          'No Meta Ads account linked (mkt_social_config.fb_ad_account_id is empty) — link one with a payment method in Business Manager first.',
      });
      return ok({ blocked: true, reason: 'no ad account linked', candidate: best });
    }

    const token = config.fb_page_access_token as string;
    const actId = `act_${config.fb_ad_account_id}`;
    const platform = best.channel === 'instagram' ? 'instagram' : 'facebook';

    // Tracked so a failure part-way through doesn't strand billable objects
    // on the ad account. Meta cascades a campaign delete to its children.
    let campaignId: string | null = null;

    try {
      const campaign = await fbPost(`${actId}/campaigns`, token, {
        name: `Boost ${best.channel} ${startDate}`,
        objective: 'OUTCOME_ENGAGEMENT',
        status: 'ACTIVE',
        special_ad_categories: [],
        is_adset_budget_sharing_enabled: false,
      });
      campaignId = campaign.id as string;

      const interests = await resolveInterests(actId, token, [
        'Small business',
        'Entrepreneurship',
      ]);

      const adset = await fbPost(`${actId}/adsets`, token, {
        name: `Boost ${best.channel} ${startDate} adset`,
        campaign_id: campaignId,
        daily_budget: settings.daily_budget_paise,
        billing_event: 'IMPRESSIONS',
        optimization_goal: 'POST_ENGAGEMENT',
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        start_time: new Date(now.getTime() + 5 * 60_000).toISOString(),
        end_time: new Date(now.getTime() + settings.days * 24 * 60 * 60 * 1000).toISOString(),
        targeting: buildTargeting({ interests, platforms: [platform] }),
        status: 'ACTIVE',
      });

      const creative = await fbPost(`${actId}/adcreatives`, token, {
        object_story_id: `${config.fb_page_id}_${best.fb_post_id}`,
      });

      const ad = await fbPost(`${actId}/ads`, token, {
        name: `Boost ${best.channel} ${startDate} ad`,
        adset_id: adset.id,
        creative: { creative_id: creative.id },
        status: 'ACTIVE',
      });

      await record('active', {
        campaign_id: campaignId,
        adset_id: adset.id as string,
        ad_id: ad.id as string,
      });

      return ok({ boosted: best, campaign_id: campaignId, adset_id: adset.id, ad_id: ad.id });
    } catch (e) {
      // A campaign with no ad under it can never deliver, but it does clutter
      // the account and reads as a live boost in Ads Manager. Bin it.
      const cleaned = campaignId ? await fbDelete(campaignId, token) : false;
      const reason = describeMetaError(e);
      console.error('[social-boost] launch failed:', reason);
      await record('failed', {
        error: `${reason}${campaignId && !cleaned ? ` (orphaned campaign ${campaignId} left on the account)` : ''}`,
      });
      return err(500, reason);
    }
  } catch (e) {
    console.error('[social-boost]', e);
    return err(500, e instanceof Error ? e.message : String(e));
  }
});
