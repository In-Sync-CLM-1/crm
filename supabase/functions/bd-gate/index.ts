/**
 * bd-gate — the day-7 report that decides whether the next wave goes out.
 *
 * The whole point is to separate three failures that look identical from the
 * outside:
 *
 *   bounces > 1          contact data problem. Fix the source.
 *                        Do NOT touch the copy.
 *   delivered, no opens  deliverability or subject. Re-run mail-tester before
 *                        changing anything.
 *   opens, no replies    the body. Only now rewrite it.
 *
 * Also reports reply rate by angle and by proof, so the next wave's selection
 * is fed by evidence rather than taste.
 *
 *   POST { batch_no?: 1 }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { BD_ORG_ID } from '../_shared/bdPipeline.ts';

const ok = (d: unknown) => new Response(JSON.stringify(d), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const err = (s: number, m: string) => new Response(JSON.stringify({ error: m }), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const { data: events } = await supabase
      .from('bd_events')
      .select('firm_id, event_type, angle_version, proof_key, occurred_at')
      .eq('org_id', BD_ORG_ID);

    const rows = events || [];
    const firmsWith = (t: string) => new Set(rows.filter((e) => e.event_type === t).map((e) => e.firm_id));

    const sent = firmsWith('sent');
    const opened = firmsWith('opened');
    const replied = firmsWith('replied');
    const bounced = firmsWith('bounced');
    const complained = firmsWith('complained');

    // Angle and proof travel on the queued/sent event, so a reply can be
    // attributed back to the choice that produced it.
    const byAngle: Record<string, { sent: number; replied: number }> = {};
    const byProof: Record<string, { sent: number; replied: number }> = {};
    for (const e of rows) {
      if (e.event_type !== 'queued') continue;
      const a = `v${e.angle_version ?? '?'}`;
      const p = e.proof_key ?? '?';
      (byAngle[a] ||= { sent: 0, replied: 0 }).sent++;
      (byProof[p] ||= { sent: 0, replied: 0 }).sent++;
      if (replied.has(e.firm_id)) { byAngle[a].replied++; byProof[p].replied++; }
    }

    // The three diagnoses, in the order the spec insists on. Only one fires:
    // rewriting the body when the problem is delivery wastes the rewrite.
    let diagnosis: string;
    let action: string;
    if (bounced.size > 1) {
      diagnosis = `${bounced.size} bounces — contact data problem`;
      action = 'Fix the contact source. Do NOT touch the copy.';
    } else if (sent.size > 0 && opened.size === 0) {
      diagnosis = 'delivered but no opens — deliverability or subject';
      action = 'Re-run mail-tester before changing anything.';
    } else if (opened.size > 0 && replied.size === 0) {
      diagnosis = 'opens but no replies — the body';
      action = 'Only now rewrite the body.';
    } else if (replied.size > 0) {
      diagnosis = `${replied.size} replies from ${sent.size} sent`;
      action = 'Working. Feed the winning angle and proof into the next wave.';
    } else {
      diagnosis = 'not enough data yet';
      action = 'Wait for the batch to land.';
    }

    // Abort conditions — the gate is also the brake.
    const aborts: string[] = [];
    if (sent.size >= 15 && bounced.size > 1) aborts.push(`bounces ${bounced.size} exceed 1 in 15`);
    if (complained.size > 0) aborts.push(`${complained.size} spam complaint(s)`);

    const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

    return ok({
      success: true,
      totals: {
        firms_sent: sent.size,
        delivered_or_sent: sent.size,
        opened: opened.size,
        replied: replied.size,
        bounced: bounced.size,
        open_rate_pct: pct(opened.size, sent.size),
        reply_rate_pct: pct(replied.size, sent.size),
      },
      diagnosis,
      action,
      abort_conditions_hit: aborts,
      proceed_to_next_wave: aborts.length === 0,
      by_angle: Object.fromEntries(Object.entries(byAngle).map(([k, v]) => [k, { ...v, reply_rate_pct: pct(v.replied, v.sent) }])),
      by_proof: Object.fromEntries(Object.entries(byProof).map(([k, v]) => [k, { ...v, reply_rate_pct: pct(v.replied, v.sent) }])),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[bd-gate] fatal:', msg);
    return err(500, msg);
  }
});
