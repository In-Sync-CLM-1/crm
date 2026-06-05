import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

/**
 * Marketing / Ad Analytics funnel for the in-CRM dashboard.
 *
 * Assembles one funnel from two sources:
 *   - Ad cost & traffic  -> crm.mkt_google_ads_campaigns / _keywords (synced daily)
 *   - Lead outcomes      -> globalcrm contacts (gclid + pipeline stage), read via DEST_*
 *
 * Returns spend -> clicks -> demo requests -> qualified -> won, plus cost-per-lead
 * and cost-per-qualified-lead. "Won / revenue" is surfaced as a count now; the
 * money value lights up in Phase 2 once payments are linked back to the gclid.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const crm = getSupabaseClient();

    // verify_jwt is false at the gateway (the frontend's new publishable key trips
    // the gateway's JWT check). Guard here instead: bind the caller's token to an
    // anon client so the auth server validates it as a real logged-in user session
    // — the bare anon/publishable key resolves to no user and is rejected.
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user || user.role !== 'authenticated') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { days = 30 } = await req.json().catch(() => ({ days: 30 }));
    const since = new Date(Date.now() - Number(days) * 86400000);
    const sinceDate = since.toISOString().slice(0, 10);
    const sinceIso = since.toISOString();
    const gcUrl = Deno.env.get('GLOBALCRM_SUPABASE_URL');
    const gcKey = Deno.env.get('GLOBALCRM_SERVICE_KEY');
    if (!gcUrl || !gcKey) throw new Error('GLOBALCRM_SUPABASE_URL / GLOBALCRM_SERVICE_KEY not configured');
    const globalcrm = createClient(gcUrl, gcKey, { auth: { persistSession: false, autoRefreshToken: false } });

    // ── Ad cost & traffic (crm) ──────────────────────────────────────────
    const { data: campRows } = await crm
      .from('mkt_google_ads_campaigns')
      .select('cost, clicks, impressions, metrics_date')
      .gte('metrics_date', sinceDate);
    let spend = 0, clicks = 0, impressions = 0;
    for (const r of campRows || []) {
      spend += Number(r.cost || 0);
      clicks += Number(r.clicks || 0);
      impressions += Number(r.impressions || 0);
    }
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

    // Top keywords (aggregated over the window).
    const { data: kwRows } = await crm
      .from('mkt_google_ads_keywords')
      .select('keyword, match_type, clicks, impressions, cost, conversions, metrics_date')
      .gte('metrics_date', sinceDate);
    const kwMap = new Map<string, { keyword: string; clicks: number; impressions: number; cost: number }>();
    for (const r of kwRows || []) {
      const key = `${r.keyword}`;
      const e = kwMap.get(key) || { keyword: r.keyword, clicks: 0, impressions: 0, cost: 0 };
      e.clicks += Number(r.clicks || 0);
      e.impressions += Number(r.impressions || 0);
      e.cost += Number(r.cost || 0);
      kwMap.set(key, e);
    }
    const keywords = [...kwMap.values()].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 15);

    // ── Lead outcomes (globalcrm) ────────────────────────────────────────
    const { data: rule } = await globalcrm
      .from('lead_assignment_rules')
      .select('org_id')
      .ilike('product', 'worksync')
      .limit(1)
      .maybeSingle();

    let demoRequests = 0, qualified = 0, won = 0;
    if (rule?.org_id) {
      const { data: stages } = await globalcrm
        .from('pipeline_stages')
        .select('id, stage_order')
        .eq('org_id', rule.org_id);
      const orderById = new Map<string, number>((stages || []).map((s: { id: string; stage_order: number }) => [s.id, s.stage_order]));

      const { data: leads } = await globalcrm
        .from('contacts')
        .select('id, pipeline_stage_id, created_at')
        .eq('org_id', rule.org_id)
        .not('gclid', 'is', null)
        .gte('created_at', sinceIso)
        .limit(5000);
      for (const l of leads || []) {
        demoRequests++;
        const ord = orderById.get(l.pipeline_stage_id) ?? 0;
        if (ord >= 4 && ord <= 7) qualified++;
        if (ord === 7) won++;
      }
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    const result = {
      range_days: Number(days),
      funnel: {
        spend: round(spend),
        impressions,
        clicks,
        ctr: round(ctr),
        demo_requests: demoRequests,
        qualified,
        won,
      },
      efficiency: {
        cost_per_click: clicks > 0 ? round(spend / clicks) : null,
        cost_per_demo_request: demoRequests > 0 ? round(spend / demoRequests) : null,
        cost_per_qualified: qualified > 0 ? round(spend / qualified) : null,
        // Phase 2: revenue / ROAS once payments are linked to the gclid.
        revenue: null,
        roas: null,
      },
      keywords: keywords.map((k) => ({ ...k, cost: round(k.cost) })),
    };

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
