/**
 * bd-grade — re-grade the BD target list against the CONFIG block in
 * _shared/bdPipeline.ts. Change a threshold there, invoke this, and the whole
 * list re-grades consistently. New scrapes append and grade the same way.
 *
 *   POST {}                 re-grade every firm
 *   POST { firm_ids: [] }   re-grade a subset
 *
 * Never touches the manual states (PARKED / SENT / CLOSED / EXCLUDED) — those
 * are set by hand and a grader that overwrote them would silently re-enter a
 * firm that is already in an active sequence.
 */
import { BD_ORG_ID, gradeFirm, type FirmRow } from '../_shared/bdPipeline.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const ok = (d: unknown) => new Response(JSON.stringify(d), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const err = (s: number, m: string) => new Response(JSON.stringify({ error: m }), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = getSupabaseClient();

  try {
    const body = await req.json().catch(() => ({}));
    const firmIds: string[] | undefined = body.firm_ids;

    let query = supabase
      .from('bd_firms')
      .select('id, firm_name, headcount_band, bill_rate_band, fit_score, ai_services_pct, has_crm_erp_line, has_staff_aug, has_domain_anchor, other_services, research_facts, grade, state_flag')
      .eq('org_id', BD_ORG_ID);
    if (firmIds?.length) query = query.in('id', firmIds);

    const { data: firms, error } = await query;
    if (error) return err(500, error.message);
    if (!firms?.length) return ok({ skip: 'no firms to grade' });

    const counts: Record<string, number> = {};
    const changes: Record<string, unknown>[] = [];

    for (const f of firms) {
      // A firm in an active sequence, closed, parked or excluded keeps its
      // state — regrading is about the pool, not about live conversations.
      if (f.state_flag) { counts[`skipped_${f.state_flag}`] = (counts[`skipped_${f.state_flag}`] || 0) + 1; continue; }

      const result = gradeFirm(f as FirmRow);
      counts[result.grade] = (counts[result.grade] || 0) + 1;

      if (result.grade !== f.grade) {
        changes.push({ firm: f.firm_name, from: f.grade, to: result.grade, why: result.reasons.join('; ') });
      }

      await supabase
        .from('bd_firms')
        .update({
          grade: result.grade,
          notes: result.promoted_by ? `graded ${result.grade}: ${result.reasons.join('; ')}` : `graded ${result.grade}: ${result.reasons.join('; ')}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', f.id);
    }

    console.log(`[bd-grade] graded ${firms.length}:`, JSON.stringify(counts));
    return ok({ success: true, graded: firms.length, counts, changed: changes.length, changes: changes.slice(0, 25) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[bd-grade] fatal:', msg);
    return err(500, msg);
  }
});
