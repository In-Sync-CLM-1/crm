/**
 * mkt-ad-campaign-generator — the autonomous paid-ads engine. Runs daily
 * (cron-worker "ad-campaign-generator"). Fully autonomous: decides what to
 * promote, writes the copy, generates the image, and LAUNCHES the real
 * campaign — no human review step. The ONLY thing a human controls is the
 * budget ceiling (mkt_engine_config config_key='paid_ads_budget'); with no
 * budget set for a channel, this engine does nothing on that channel — that
 * is the entire safety gate, by design (Amit: "AI should decide. Human can
 * intervene" — budget is the one input the AI cannot set for itself).
 *
 * Per org, per channel (google/meta):
 *  1. Retire any campaign whose end_date has passed (status -> completed).
 *  2. If a campaign is still active, do nothing this cycle (one campaign in
 *     flight per channel at a time — budget, launch_date, duration are fixed
 *     for its whole run; a new one starts once it completes).
 *  3. Otherwise: pick the product least recently promoted, pull its ICP +
 *     recent performance, write a fresh campaign brief (learning from that
 *     performance), generate an AI image, and launch it for real via
 *     mkt-google-ads-launch / mkt-meta-ads-launch.
 *
 * Human intervention (pause a live campaign, swap in an uploaded image/
 * video) happens through the review surface + Arohan chat, not this loop.
 */
import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { generateAdCampaign } from '../_shared/adCampaignVoice.ts';
import { buildImagePrompt, generateGeminiImage } from '../_shared/geminiImage.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';

function ok(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function err(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function todayIST(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

interface BudgetConfig {
  google?: { daily_budget: number; active: boolean };
  meta?: { daily_budget: number; active: boolean };
}

// deno-lint-ignore no-explicit-any
async function retireCompleted(supabase: any, orgId: string, channel: string, today: string) {
  await supabase
    .from('mkt_ad_campaigns')
    .update({ status: 'completed' })
    .eq('org_id', orgId)
    .eq('channel', channel)
    .eq('status', 'active')
    .lt('end_date', today);
}

// deno-lint-ignore no-explicit-any
async function pickProduct(supabase: any, orgId: string, channel: string): Promise<Record<string, unknown> | null> {
  const { data: products } = await supabase
    .from('mkt_products')
    .select('product_key, product_name, product_url')
    .eq('org_id', orgId)
    .eq('active', true)
    .order('product_key');
  if (!products?.length) return null;

  const { data: history } = await supabase
    .from('mkt_ad_campaigns')
    .select('product_key')
    .eq('org_id', orgId)
    .eq('channel', channel);
  const counts = new Map<string, number>();
  for (const p of products) counts.set(p.product_key, 0);
  for (const h of history ?? []) counts.set(h.product_key, (counts.get(h.product_key) ?? 0) + 1);

  products.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
    (counts.get(a.product_key as string) ?? 0) - (counts.get(b.product_key as string) ?? 0));
  return products[0];
}

// deno-lint-ignore no-explicit-any
async function performanceSummary(supabase: any, orgId: string, channel: string, productKey: string): Promise<string> {
  if (channel === 'google') {
    const { data } = await supabase
      .from('mkt_google_ads_campaigns')
      .select('name, status, clicks, cost, conversions, ctr, avg_cpc')
      .eq('org_id', orgId)
      .order('last_synced_at', { ascending: false })
      .limit(5);
    if (!data?.length) return '(no prior Google Ads campaigns synced yet)';
    return data.map((c: Record<string, unknown>) =>
      `${c.name} (${c.status}): ${c.clicks} clicks, ₹${c.cost} spent, ${c.conversions} conversions, CTR ${c.ctr}, avg CPC ₹${c.avg_cpc}`).join('\n');
  }
  const { data } = await supabase
    .from('mkt_ad_campaigns')
    .select('name, status, content_strategy_note')
    .eq('org_id', orgId)
    .eq('channel', 'meta')
    .eq('product_key', productKey)
    .order('created_at', { ascending: false })
    .limit(3);
  if (!data?.length) return '(no prior Meta campaigns for this product yet)';
  return data.map((c: Record<string, unknown>) => `${c.name} (${c.status}): ${c.content_strategy_note}`).join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = getSupabaseClient();
    const today = todayIST();
    const supaUrl = Deno.env.get('SUPABASE_URL');
    const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const { data: budgetRows, error: budgetErr } = await supabase
      .from('mkt_engine_config')
      .select('org_id, config_value')
      .eq('config_key', 'paid_ads_budget');
    if (budgetErr) return err(500, budgetErr.message);
    if (!budgetRows?.length) return ok({ skip: 'no paid_ads_budget configured for any org' });

    const results: Record<string, unknown>[] = [];

    for (const row of budgetRows) {
      const orgId = row.org_id as string;
      const budget = row.config_value as BudgetConfig;

      for (const channel of ['google', 'meta'] as const) {
        const chBudget = budget[channel];
        if (!chBudget?.active || !chBudget.daily_budget) continue;

        // Real execution gate (2026-07-23, Arohan brief): no Meta campaign
        // launches until at least one LinkedIn follower-audience snapshot
        // exists — that is the real signal responsible Facebook targeting
        // needs. Budget-on is not sufficient by itself for this channel.
        let audienceSummary: string | null = null;
        if (channel === 'meta') {
          const { data: snapshot } = await supabase
            .from('mkt_linkedin_follower_demographics')
            .select('snapshot_date, by_seniority, by_function, by_industry, by_country')
            .eq('org_id', orgId)
            .order('snapshot_date', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!snapshot) {
            results.push({ org_id: orgId, channel, skip: 'blocked pending LinkedIn audience data (see Arohan brief 2026-07-23) — waiting on first weekly follower-demographics sync' });
            continue;
          }
          const top = (arr: unknown, n = 4) => Array.isArray(arr) ? (arr as { label: string; count: number }[]).slice(0, n).map((r) => r.label).join(', ') : '';
          audienceSummary = `LinkedIn follower audience (${snapshot.snapshot_date}) — seniority: ${top(snapshot.by_seniority)}; function: ${top(snapshot.by_function)}; industry: ${top(snapshot.by_industry)}; country: ${top(snapshot.by_country)}.`;
        }

        await retireCompleted(supabase, orgId, channel, today);

        const { data: active } = await supabase
          .from('mkt_ad_campaigns')
          .select('id, name, end_date')
          .eq('org_id', orgId)
          .eq('channel', channel)
          .eq('status', 'active')
          .maybeSingle();
        if (active) {
          results.push({ org_id: orgId, channel, skip: 'campaign already active', campaign: active.name, ends: active.end_date });
          continue;
        }

        const product = await pickProduct(supabase, orgId, channel);
        if (!product) {
          results.push({ org_id: orgId, channel, skip: 'no active products' });
          continue;
        }

        const { data: icp } = await supabase
          .from('mkt_product_icp')
          .select('industries, designations, pain_points')
          .eq('org_id', orgId)
          .eq('product_key', product.product_key)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: recentRows } = await supabase
          .from('mkt_ad_campaigns')
          .select('name')
          .eq('org_id', orgId)
          .eq('channel', channel)
          .order('created_at', { ascending: false })
          .limit(10);
        const recentNames = (recentRows ?? []).map((r: Record<string, unknown>) => r.name as string);

        const summary = await performanceSummary(supabase, orgId, channel, product.product_key as string);
        const fullSummary = audienceSummary ? `${summary}\n\n${audienceSummary}` : summary;

        try {
          const brief = await generateAdCampaign(
            channel,
            { ...product, ...icp } as never,
            fullSummary,
            chBudget.daily_budget,
            recentNames,
          );

          const imagePrompt = buildImagePrompt(brief.image_keywords?.length ? brief.image_keywords : [product.product_name as string, 'business growth'], (icp?.industries as string[])?.join(', ') || 'Indian SMBs');
          const imageUrl = await generateGeminiImage(imagePrompt, '1:1', `ads/${orgId}/${channel}/${Date.now()}`).catch(() => null);

          let launchResult: Record<string, unknown>;
          if (channel === 'google') {
            const { data: accountCfg } = await supabase
              .from('mkt_engine_config')
              .select('config_value')
              .eq('org_id', orgId)
              .eq('config_key', 'google_ads_accounts')
              .maybeSingle();
            const customerId = (accountCfg?.config_value as { customer_ids?: string[] })?.customer_ids?.[0];
            if (!customerId) { results.push({ org_id: orgId, channel, skip: 'no google_ads_accounts.customer_ids configured' }); continue; }

            const res = await fetch(`${supaUrl}/functions/v1/mkt-google-ads-launch`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${svcKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                org_id: orgId,
                customer_id: customerId,
                name: brief.name,
                landing_url: product.product_url,
                daily_budget: chBudget.daily_budget,
                launch_date: today,
                duration_days: brief.duration_days,
                headlines: brief.headlines,
                descriptions: brief.descriptions,
                keywords: brief.keywords,
              }),
              signal: AbortSignal.timeout(60_000),
            });
            launchResult = await res.json();
            if (!res.ok || launchResult.error) throw new Error(String(launchResult.error ?? res.status));
          } else {
            const res = await fetch(`${supaUrl}/functions/v1/mkt-meta-ads-launch`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${svcKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                org_id: orgId,
                name: brief.name,
                landing_url: product.product_url,
                daily_budget: chBudget.daily_budget,
                launch_date: today,
                duration_days: brief.duration_days,
                primary_text: brief.primary_text,
                headline: brief.headline,
                image_url: imageUrl,
                targeting_interests: brief.targeting_interests,
              }),
              signal: AbortSignal.timeout(60_000),
            });
            launchResult = await res.json();
            if (!res.ok || launchResult.error) throw new Error(String(launchResult.error ?? res.status));
            if (launchResult.blocked) {
              await supabase.from('mkt_ad_campaigns').insert({
                org_id: orgId, channel, status: 'failed', product_key: product.product_key, name: brief.name,
                content_strategy_note: brief.strategy_note, primary_text: brief.primary_text, meta_headline: brief.headline,
                image_url: imageUrl, image_source: imageUrl ? 'ai' : null,
                daily_budget: chBudget.daily_budget, launch_date: today, duration_days: brief.duration_days,
                end_date: today, error_message: String(launchResult.reason),
              });
              results.push({ org_id: orgId, channel, blocked: launchResult.reason });
              continue;
            }
          }

          await supabase.from('mkt_ad_campaigns').insert({
            org_id: orgId,
            channel,
            status: 'active',
            product_key: product.product_key,
            name: brief.name,
            content_strategy_note: brief.strategy_note,
            headlines: brief.headlines ?? null,
            descriptions: brief.descriptions ?? null,
            keywords: brief.keywords ?? null,
            primary_text: brief.primary_text ?? null,
            meta_headline: brief.headline ?? null,
            image_url: imageUrl,
            image_source: imageUrl ? 'ai' : null,
            daily_budget: chBudget.daily_budget,
            launch_date: today,
            duration_days: brief.duration_days,
            end_date: launchResult.end_date,
            google_customer_id: channel === 'google' ? (launchResult.customer_id as string ?? null) : null,
            google_campaign_id: channel === 'google' ? (launchResult.campaign_id as string) : null,
            google_budget_id: channel === 'google' ? (launchResult.budget_id as string) : null,
            google_ad_group_id: channel === 'google' ? (launchResult.ad_group_id as string) : null,
            meta_campaign_id: channel === 'meta' ? (launchResult.campaign_id as string) : null,
            meta_adset_id: channel === 'meta' ? (launchResult.adset_id as string) : null,
            meta_ad_id: channel === 'meta' ? (launchResult.ad_id as string) : null,
          });

          results.push({ org_id: orgId, channel, launched: brief.name, end_date: launchResult.end_date });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await supabase.from('mkt_ad_campaigns').insert({
            org_id: orgId, channel, status: 'failed', product_key: product.product_key, name: `${product.product_name} (failed)`,
            daily_budget: chBudget.daily_budget, launch_date: today, duration_days: 1, end_date: today,
            error_message: msg,
          });
          results.push({ org_id: orgId, channel, error: msg });
        }
      }
    }

    return ok({ results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[ad-campaign-generator] fatal:', msg);
    return err(500, msg);
  }
});
