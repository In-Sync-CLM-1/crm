import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { createEngineLogger } from '../_shared/engineLogger.ts';

/**
 * OFFLINE CONVERSION FEEDBACK LOOP — Phase 1 (qualified leads).
 *
 * The funnel spans two projects:
 *   - Lead + qualification live in globalcrm (read via DEST_* service creds).
 *   - The Google Ads account + API creds live here in crm.
 *
 * Flow:
 *   1. Read WorkSync leads in globalcrm that came from a Google Ad (gclid present)
 *      and have reached "Qualified" or beyond (stage_order 4..7, i.e. excluding
 *      New/Demo Requested/Contacted and the terminal "Lost").
 *   2. Record each as a conversion in crm's mkt_google_ads_feedback ledger
 *      (idempotent on lead_id + conversion_type).
 *   3. Upload the not-yet-sent ones to Google Ads via uploadClickConversions,
 *      tied to the original gclid, so bidding learns which clicks become genuine
 *      qualified business — not just form fills.
 *
 * Scheduled hourly by the Cloudflare cron worker. Failure-only: logs/records
 * errors; never emits success pings.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CUSTOMER_ID = (Deno.env.get('GOOGLE_ADS_CUSTOMER_ID') || '6785487693').replace(/-/g, '');
const QUALIFIED_CONVERSION =
  Deno.env.get('GOOGLE_ADS_QUALIFIED_LEAD_CONVERSION') ||
  'customers/6785487693/conversionActions/7636244387';
const ADS_API = 'https://googleads.googleapis.com/v21';

// "2026-06-05T13:00:00.000Z" -> "2026-06-05 13:00:00+00:00" (Google Ads format).
function fmtAdsDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+00:00`;
}

async function googleAccessToken(): Promise<string> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_ADS_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_ADS_CLIENT_SECRET')!,
      refresh_token: Deno.env.get('GOOGLE_ADS_REFRESH_TOKEN')!,
      grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error(`Google OAuth error: ${await r.text()}`);
  return (await r.json()).access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const logger = createEngineLogger('mkt-ad-conversion-upload');
  const crm = getSupabaseClient();

  try {
    const developerToken = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN');
    const destUrl = Deno.env.get('DEST_SUPABASE_URL');
    const destKey = Deno.env.get('DEST_SERVICE_ROLE_KEY_LEGACY');
    if (!developerToken) throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN not configured');
    if (!destUrl || !destKey) throw new Error('DEST_SUPABASE_URL / DEST_SERVICE_ROLE_KEY_LEGACY not configured');

    const globalcrm = createClient(destUrl, destKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // The crm marketing org that owns the Google Ads config — feedback rows hang
    // off it (org_id FK -> organizations).
    const { data: cfg } = await crm
      .from('mkt_engine_config')
      .select('org_id')
      .eq('config_key', 'google_ads_accounts')
      .limit(1)
      .maybeSingle();
    const marketingOrgId = cfg?.org_id;
    if (!marketingOrgId) throw new Error('No google_ads_accounts config / marketing org found');

    // 1. Resolve the WorkSync org + its "Qualified..Won" stage ids in globalcrm.
    const { data: rule } = await globalcrm
      .from('lead_assignment_rules')
      .select('org_id, product')
      .ilike('product', 'worksync')
      .limit(1)
      .maybeSingle();
    if (!rule?.org_id) throw new Error('WorkSync lead_assignment_rule not found in globalcrm');

    const { data: stages } = await globalcrm
      .from('pipeline_stages')
      .select('id, stage_order')
      .eq('org_id', rule.org_id)
      .gte('stage_order', 4) // Qualified
      .lte('stage_order', 7); // Won (Lost = 8 is excluded)
    const qualifiedStageIds = (stages || []).map((s: { id: string }) => s.id);
    if (qualifiedStageIds.length === 0) throw new Error('No qualified+ stages found for WorkSync org');

    // 2. Pull ad-sourced, qualified-or-better leads with a gclid.
    const { data: leads, error: leadErr } = await globalcrm
      .from('contacts')
      .select('id, gclid, updated_at, created_at')
      .eq('org_id', rule.org_id)
      .not('gclid', 'is', null)
      .in('pipeline_stage_id', qualifiedStageIds)
      .limit(1000);
    if (leadErr) throw new Error(`globalcrm contacts read failed: ${leadErr.message}`);

    // 3. Upsert into the ledger (idempotent — never resets an already-pushed row).
    let captured = 0;
    if (leads && leads.length > 0) {
      const rows = leads.map((l: { id: string; gclid: string; updated_at: string; created_at: string }) => ({
        org_id: marketingOrgId,
        lead_id: l.id,
        gclid: l.gclid,
        conversion_type: 'lead_qualified',
        conversion_value: 0,
        conversion_at: l.updated_at || l.created_at,
      }));
      const { error: upErr, count } = await crm
        .from('mkt_google_ads_feedback')
        .upsert(rows, { onConflict: 'lead_id,conversion_type', ignoreDuplicates: true, count: 'exact' });
      if (upErr) throw new Error(`ledger upsert failed: ${upErr.message}`);
      captured = count ?? 0;
    }

    // 4. Fetch unsent qualified conversions and upload to Google Ads.
    const { data: pending } = await crm
      .from('mkt_google_ads_feedback')
      .select('id, gclid, conversion_at')
      .eq('conversion_type', 'lead_qualified')
      .eq('pushed_to_google_ads', false)
      .not('gclid', 'is', null)
      .limit(200);

    let uploaded = 0;
    let failed = 0;
    if (pending && pending.length > 0) {
      const accessToken = await googleAccessToken();
      const conversions = pending.map((p: { gclid: string; conversion_at: string }) => ({
        gclid: p.gclid,
        conversionAction: QUALIFIED_CONVERSION,
        conversionDateTime: fmtAdsDateTime(p.conversion_at),
        conversionValue: 0,
        currencyCode: 'INR',
      }));

      const res = await fetch(`${ADS_API}/customers/${CUSTOMER_ID}:uploadClickConversions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversions, partialFailure: true }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(`uploadClickConversions HTTP ${res.status}: ${JSON.stringify(body)}`);

      // Map per-row failures (partial failure) by their operation index.
      const failedIdx = new Set<number>();
      const errMsgByIdx: Record<number, string> = {};
      const pf = body.partialFailureError;
      if (pf?.details?.length) {
        for (const d of pf.details) {
          for (const e of d.errors || []) {
            const idx = e.location?.fieldPathElements?.find((f: { fieldName: string }) => f.fieldName === 'conversions')?.index;
            if (typeof idx === 'number') { failedIdx.add(idx); errMsgByIdx[idx] = e.message || 'unknown'; }
          }
        }
      }

      for (let i = 0; i < pending.length; i++) {
        const row = pending[i];
        if (failedIdx.has(i)) {
          failed++;
          await crm.from('mkt_google_ads_feedback')
            .update({ google_ads_push_error: errMsgByIdx[i]?.slice(0, 500) })
            .eq('id', row.id);
        } else {
          uploaded++;
          await crm.from('mkt_google_ads_feedback')
            .update({ pushed_to_google_ads: true, pushed_to_google_ads_at: new Date().toISOString(), google_ads_push_error: null })
            .eq('id', row.id);
        }
      }
    }

    await logger.info('upload-complete', { captured, uploaded, failed });
    if (failed > 0) await logger.warn('upload-partial-failures', { failed });

    return new Response(JSON.stringify({ ok: true, captured, uploaded, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await logger.error('upload-fatal', error);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
