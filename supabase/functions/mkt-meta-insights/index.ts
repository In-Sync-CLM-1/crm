import { corsHeaders } from '../_shared/corsHeaders.ts';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';

/**
 * mkt-meta-insights — pull real Meta ad performance into
 * mkt_meta_insights_daily, one row per ad account per day.
 *
 * Why this exists: the dashboard was printing "Meta: ₹0" while a promotion was
 * demonstrably running in Ads Center. Diagnosed 2026-08-17 — the stored Page
 * token holds ads_read/ads_management/business_management, but its identity is
 * the PAGE, so /me/adaccounts does not resolve. Through the business
 * (3572952712838210) it can see exactly one ad account,
 * act_1503032350759926, and that account reports amount_spent = 0 with zero
 * ads. The live promotion is therefore funded by an ad account outside the
 * business, which no amount of querying from here can discover.
 *
 * So this function does not assume one account. It walks:
 *   1. every account owned by every business the token can see
 *   2. every client account of those businesses
 *   3. any extra account ids listed in mkt_engine_config.meta_ad_accounts
 *      — the escape hatch: drop an id in there (or add the account to the
 *      business) and its numbers appear with no code change
 *
 * It records what it found AND what it could see, so the dashboard can tell
 * "nothing was spent" apart from "we cannot read the account that spent it".
 */
const FB = 'https://graph.facebook.com/v21.0';
const ORG_ID = '65e22e43-f23d-4c0a-9d84-2eba65ad0e12';

interface AccountRef { id: string; name?: string }

async function fbGet(path: string, token: string): Promise<Record<string, unknown>> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${FB}/${path}${sep}access_token=${encodeURIComponent(token)}`, {
    signal: AbortSignal.timeout(20_000),
  });
  const json = await res.json().catch(() => ({}));
  return json as Record<string, unknown>;
}

/** Every ad account this token can actually reach, de-duplicated. */
async function discoverAccounts(token: string, extra: string[]): Promise<AccountRef[]> {
  const found = new Map<string, AccountRef>();

  // The token's identity may be a Page, so /me/adaccounts often fails — try it
  // anyway, since a user-typed token would answer here.
  const mine = await fbGet('me/adaccounts?fields=account_id,name&limit=100', token);
  for (const a of (mine.data as AccountRef[] | undefined) ?? []) found.set(a.id, a);

  const businesses = await fbGet('me/businesses?fields=id,name&limit=50', token);
  const bizIds = ((businesses.data as { id: string }[] | undefined) ?? []).map((b) => b.id);
  // The page token cannot list its businesses either; fall back to the one we
  // know owns this page.
  if (!bizIds.length) bizIds.push('3572952712838210');

  for (const biz of bizIds) {
    for (const edge of ['owned_ad_accounts', 'client_ad_accounts']) {
      const r = await fbGet(`${biz}/${edge}?fields=account_id,name&limit=100`, token);
      for (const a of (r.data as AccountRef[] | undefined) ?? []) found.set(a.id, a);
    }
  }

  for (const id of extra) {
    const norm = id.startsWith('act_') ? id : `act_${id}`;
    if (!found.has(norm)) found.set(norm, { id: norm });
  }

  return [...found.values()];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const logger = createEngineLogger('mkt-meta-insights');
  try {
    const supabase = getSupabaseClient();

    const { data: social } = await supabase
      .from('mkt_social_config')
      .select('fb_page_access_token, fb_ad_account_id')
      .eq('active', true)
      .maybeSingle();

    const token = social?.fb_page_access_token as string | undefined;
    if (!token) {
      await logger.warn('no-token', { detail: 'mkt_social_config has no active fb_page_access_token' });
      return new Response(JSON.stringify({ ok: false, reason: 'Facebook not connected' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extra account ids, for accounts outside the business.
    const { data: cfg } = await supabase
      .from('mkt_engine_config')
      .select('config_value')
      .eq('org_id', ORG_ID)
      .eq('config_key', 'meta_ad_accounts')
      .maybeSingle();
    const extra = [
      ...(((cfg?.config_value as { account_ids?: string[] } | null)?.account_ids) ?? []),
      ...(social?.fb_ad_account_id ? [String(social.fb_ad_account_id)] : []),
    ];

    const accounts = await discoverAccounts(token, extra);
    const rows: Record<string, unknown>[] = [];
    const seen: { account: string; name?: string; days: number; spend: number; error?: string }[] = [];

    for (const acct of accounts) {
      // Daily breakdown for the last 30 days. time_increment=1 gives one row
      // per day, which is what the table stores.
      const r = await fbGet(
        `${acct.id}/insights?fields=spend,impressions,reach,clicks,account_currency,account_name` +
        `&date_preset=last_30d&time_increment=1&limit=100`,
        token,
      );
      const err = (r.error as { message?: string } | undefined)?.message;
      const data = (r.data as Record<string, string>[] | undefined) ?? [];
      let spendTotal = 0;

      for (const d of data) {
        const spend = Number(d.spend ?? 0);
        spendTotal += spend;
        rows.push({
          org_id: ORG_ID,
          ad_account_id: acct.id,
          account_name: d.account_name ?? acct.name ?? null,
          stat_date: d.date_start,
          spend,
          impressions: Number(d.impressions ?? 0),
          reach: Number(d.reach ?? 0),
          clicks: Number(d.clicks ?? 0),
          results: 0,
          currency: d.account_currency ?? null,
        });
      }
      seen.push({ account: acct.id, name: acct.name, days: data.length, spend: spendTotal, error: err });
    }

    if (rows.length) {
      const { error } = await supabase
        .from('mkt_meta_insights_daily')
        .upsert(rows, { onConflict: 'org_id,ad_account_id,stat_date' });
      if (error) throw new Error(`upsert failed: ${error.message}`);
    }

    const totalSpend = seen.reduce((a, s) => a + s.spend, 0);
    await logger.info('sync-complete', { accounts: accounts.length, days: rows.length, spend: totalSpend });
    // Failure-only alerting: an account we can see but cannot read is worth a
    // warning; an account with genuinely no spend is not.
    const unreadable = seen.filter((s) => s.error);
    if (unreadable.length) await logger.warn('unreadable-accounts', { unreadable });

    return new Response(JSON.stringify({
      ok: true,
      accounts_seen: seen,
      rows_written: rows.length,
      spend_30d: totalSpend,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await logger.error('sync-failed', { error: msg });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
