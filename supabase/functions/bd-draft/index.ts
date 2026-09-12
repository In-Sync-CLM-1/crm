/**
 * bd-draft — assemble a review-ready email for EVERY step of a firm's
 * sequence in one pass: the initial email, follow-up 1 and follow-up 2.
 *
 * 2026-09-12: follow-ups used to be fixed boilerplate assembled by
 * bd-schedule at send time, with no review. Amit's rule: "every
 * communication has to follow the same rule, no templated work" — so all
 * three steps now get their own opening line generated from this firm's own
 * research facts (via _shared/bdPipeline.ts's generateOpeningLine, shared
 * so all three go through the identical quality gate), and all three land in
 * the review queue as `pending` up front — drafted alongside the initial
 * email rather than close to their due date, so there is always days of lead
 * time to review a follow-up before bd-schedule is allowed to send it.
 * bd-schedule now REQUIRES an approved draft for a step before it will send
 * that step; nothing sends unreviewed, at any step.
 *
 * The angle, the proof and the body scaffold are deterministic: they follow
 * the rules in _shared/bdPipeline.ts. Only the opening/closing line per step
 * is generated, because it is the one part that has to name something
 * specific about this firm and say what it implies. Everything else is
 * chosen, not invented.
 *
 *   POST { limit: 5 }
 */
import {
  BD_ORG_ID, pickAngle, pickProof, scoreContact, PROOFS, type FirmRow,
  hasOpeningHook, factLinesFor, generateOpeningLine, assembleFollowup1, assembleFollowup2,
  type UsableFacts,
} from '../_shared/bdPipeline.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const ok = (d: unknown) => new Response(JSON.stringify(d), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const err = (s: number, m: string) => new Response(JSON.stringify({ error: m }), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const SIGNATURE = `Amit Sengupta
Prosync AI Solutions
a@in-sync.co.in | linkedin.com/in/amitsengupta29`;

// Rotated so five sent on the same day never share a subject — identical
// subjects from rotating mailboxes is the exact pattern filters look for, and
// it undoes the personalised first line.
const SUBJECTS: Record<number, string[]> = {
  1: ['Delivery capacity — CRM implementations, US morning hours',
      'CRM delivery capacity, 8am–1pm ET',
      'Delivery capacity for CRM and ERP work'],
  2: ['Senior delivery capacity, 8am–1pm ET',
      'Delivery capacity — senior, contract, US hours',
      'Contract delivery capacity for your bench'],
  3: ['The AI question your clients are starting to ask',
      'AI delivery capacity, US morning hours',
      'The AI line your site does not have yet'],
  4: ['Delivery capacity — operations systems for agencies',
      'Delivery capacity — workforce and operations systems',
      'Delivery capacity — insurance and financial services systems'],
};

// Matches the structure of Amit's own LinkedIn outreach (see
// InSync_Lead_Recommendations_Enriched.xlsx, column PersonalizedMessage):
// warm handshake -> researched hook, softened to a timing question rather
// than a flat assertion -> a value paragraph -> a soft, specific-week call
// ask. (2026-09-11: the old version opened cold, straight into the
// researched hook with no greeting -- flagged by Amit as missing the
// "handshake" his LinkedIn messages always open with. First fix cut the
// value paragraph down to just the one industry-matched proof stat, which
// then raised a second, separate concern: leading on a single narrow
// number -- e.g. an ATS story to every staffing-shaped firm -- risks
// reading as "the ATS guy" rather than the broader proposition. The value
// paragraph now states the actual breadth ground truth from
// amitResume.ts -- 11 years as the buyer, then 10 building 14 systems sold
// to 90+ companies across unrelated industries -- and explicitly frames
// the one matched proof as a single example within that, not the whole
// pitch.)
const CLOSERS = [
  'Would you be open to a quick 15-minute call this week to see how this could fit in?',
  'Open to a quick 15-minute call this week to see how this could fit in?',
  'Worth a quick 15-minute call this week to see how this could fit in?',
];

/** The body, by angle. The first line and the proof are injected. */
function assemble(version: number, firstName: string, firstLine: string, proofText: string, closer: string): string {
  const openings: Record<number, string> = {
    1: `Your CRM and ERP work is already a revenue line for you — worth a look if pulling in outside senior capacity for it is still handled informally.`,
    2: `You already buy outside capacity, so I'll keep this direct.`,
    3: `There's no AI line on your site yet — worth a conversation if that's more a bandwidth gap than a deliberate choice.`,
    4: `I've built this exact kind of system for clients like yours before, which is the reason I'm writing.`,
  };

  // PROOFS entries are lowercase fragments written to slot after a colon
  // ("One of them: an ATS I built runs...") -- used as-is, no capitalization
  // needed since a colon doesn't start a new sentence. (2026-09-12: the
  // previous shape appended the fragment BEFORE "is one of them", which never
  // resolves grammatically -- e.g. "An ATS I built runs ... operated by 47
  // users is one of them." reads as two sentences welded together. Flagged
  // by Amit on a real draft, alongside a second, separate concern: leading
  // the paragraph on years/budget/company-count before any mention of
  // availability reads as someone too established to be asking for
  // contract work, which buries the actual ask. Cut the "$25M of budget"
  // figure and turned "Available 8am-1pm ET" from a scheduling footnote
  // into an active statement of current availability.)
  return `Hi ${firstName}, hope you're doing well.

${firstLine}

${openings[version]}

I ran these exact functions as the buyer for 11 years — HDFC Life, Canara HSBC — before spending 10 building them: 14 production systems now live across 90+ companies, from Motherson to InCred to Quess Corp. One of them: ${proofText}.

I'm taking on contract delivery work now — 8am–1pm ET, India-based, through your entity or mine.

${closer}

${SIGNATURE}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = getSupabaseClient();

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit) || 5, 15);

    // Eligible: graded A or B, researched, no manual state, no open draft.
    const { data: firms, error } = await supabase
      .from('bd_firms')
      .select('id, firm_name, city, state, time_zone, headcount_band, bill_rate_band, fit_score, ai_services_pct, has_crm_erp_line, has_staff_aug, has_domain_anchor, other_services, research_facts, disqualifier_flags, grade')
      .eq('org_id', BD_ORG_ID)
      .is('state_flag', null)
      .in('grade', ['A', 'B'])
      .not('researched_at', 'is', null)
      .order('grade', { ascending: true })
      .limit(limit * 3);

    if (error) return err(500, error.message);
    if (!firms?.length) return ok({ skip: 'no researched firms awaiting a draft' });

    const results: Record<string, unknown>[] = [];
    let made = 0;

    for (const f of firms) {
      if (made >= limit) break;

      // Per-step, not per-firm: a firm that already has all three steps
      // drafted is fully done and skipped, but one missing only its
      // follow-ups (e.g. from a prior run where line generation failed
      // partway) gets topped up rather than skipped forever.
      const { data: existingRows } = await supabase
        .from('bd_drafts').select('step, subject, first_line').eq('firm_id', f.id)
        .in('status', ['pending', 'approved', 'scheduled']);
      const existingSteps = new Set((existingRows || []).map((r) => r.step));
      if (existingSteps.has('email_1') && existingSteps.has('followup_1') && existingSteps.has('followup_2')) continue;

      // Contact: highest-priority title that isn't on the never-contact list.
      const { data: contacts } = await supabase
        .from('bd_contacts').select('id, first_name, last_name, title, email, is_primary, opted_out')
        .eq('firm_id', f.id).eq('opted_out', false);

      const ranked = (contacts || [])
        .map((c) => ({ c, s: scoreContact(c.title) }))
        .filter((x) => x.s !== null)
        .sort((a, b) => a.s!.rank - b.s!.rank);

      const chosen = ranked[0];
      // "Hi there" is worse than silence — a firm with no first name is
      // flagged for enrichment, never drafted.
      if (!chosen || !chosen.c.first_name || !chosen.c.email) {
        results.push({ firm: f.firm_name, skipped: 'no contact with a first name and email — needs enrichment' });
        continue;
      }

      const angle = pickAngle(f as FirmRow);
      const facts = (f.research_facts || {}) as Record<string, string[]>;
      const researchText = [facts.clients, facts.cases, facts.stack, facts.verticals].flat().filter(Boolean).join(', ');
      const proof = pickProof(f as FirmRow, researchText);

      // The sufficiency test is made HERE, not by the model. Asked to reply
      // INSUFFICIENT when the facts are thin, it instead wrote "your website
      // lists 'none' under clients, suggesting you may not have secured any
      // paid engagements" — it treated the placeholder as a fact and insulted
      // the firm. A deterministic gate removes that whole class of failure.
      const usable: UsableFacts = {
        clients: (facts.clients || []).filter(Boolean),
        cases: (facts.cases || []).filter(Boolean),
        stack: (facts.stack || []).filter(Boolean),
        verticals: (facts.verticals || []).filter(Boolean),
      };
      if (!hasOpeningHook(usable)) {
        results.push({ firm: f.firm_name, skipped: 'no named client, case study or distinctive stack item — nothing specific to open on' });
        continue;
      }
      const factLines = factLinesFor(usable);
      const genArgs = { firmName: f.firm_name, city: f.city, state: f.state, factLines };

      const stepsAdded: string[] = [];
      const usedLines: string[] = [];
      let emailSubject = (existingRows || []).find((r) => r.step === 'email_1')?.subject as string | undefined;

      // ── Step 1: the initial cold email ───────────────────────────────────
      let coldLine = (existingRows || []).find((r) => r.step === 'email_1')?.first_line as string | undefined;
      if (!existingSteps.has('email_1')) {
        coldLine = await generateOpeningLine({ ...genArgs, kind: 'cold_open' }) ?? undefined;
        if (!coldLine) {
          results.push({ firm: f.firm_name, skipped: 'could not produce a usable opening line from these facts — left for a human' });
          continue; // no usable hook at all — don't draft follow-ups on nothing either
        }
        const subjects = SUBJECTS[angle.version];
        emailSubject = subjects[made % subjects.length];
        const closer = CLOSERS[made % CLOSERS.length];
        const draftBody = assemble(angle.version, chosen.c.first_name, coldLine, PROOFS[proof.key].text, closer);

        const { error: insErr } = await supabase.from('bd_drafts').insert({
          org_id: BD_ORG_ID, firm_id: f.id, contact_id: chosen.c.id, step: 'email_1',
          angle_version: angle.version, proof_key: proof.key,
          subject: emailSubject, first_line: coldLine, body: draftBody,
          reasoning: {
            why_firm: `grade ${f.grade}${f.has_domain_anchor ? ' · domain anchor in the client list' : ''}${f.has_crm_erp_line ? ' · declared CRM/ERP line' : ''}${f.has_staff_aug ? ' · declared staff-aug line' : ''}`,
            why_contact: `${chosen.c.title || 'no title'} — ${chosen.s!.why}`,
            why_angle: `v${angle.version}: ${angle.why}`,
            why_proof: `${proof.key} — ${proof.why}`,
            fallback_contact: ranked[1] ? `${ranked[1].c.first_name || ''} ${ranked[1].c.last_name || ''} (${ranked[1].c.title || 'no title'})`.trim() : 'none on file',
            flags: f.disqualifier_flags || null,
          },
          status: 'pending',
        });
        if (insErr) { results.push({ firm: f.firm_name, error: `email_1: ${insErr.message}` }); continue; }
        stepsAdded.push('email_1');
      }
      if (coldLine) usedLines.push(coldLine);

      // ── Step 2: follow-up 1 (case-study nudge) ───────────────────────────
      let f1Line = (existingRows || []).find((r) => r.step === 'followup_1')?.first_line as string | undefined;
      if (!existingSteps.has('followup_1')) {
        f1Line = await generateOpeningLine({ ...genArgs, kind: 'follow_up_1', avoidLines: usedLines }) ?? undefined;
        if (f1Line) {
          const { error: insErr } = await supabase.from('bd_drafts').insert({
            org_id: BD_ORG_ID, firm_id: f.id, contact_id: chosen.c.id, step: 'followup_1',
            subject: emailSubject ? `Re: ${emailSubject}` : '(no subject)',
            first_line: f1Line, body: assembleFollowup1(chosen.c.first_name, f1Line),
            reasoning: { why_firm: 'same firm as the initial email', why_contact: 'same contact as the initial email' },
            status: 'pending',
          });
          if (insErr) results.push({ firm: f.firm_name, error: `followup_1: ${insErr.message}` });
          else stepsAdded.push('followup_1');
        } else {
          results.push({ firm: f.firm_name, skipped: 'follow-up 1 line generation failed — email_1 still drafted, will retry next run' });
        }
      }
      if (f1Line) usedLines.push(f1Line);

      // ── Step 3: follow-up 2 (breakup) ────────────────────────────────────
      if (!existingSteps.has('followup_2')) {
        const f2Line = await generateOpeningLine({ ...genArgs, kind: 'follow_up_2', avoidLines: usedLines });
        if (f2Line) {
          const { error: insErr } = await supabase.from('bd_drafts').insert({
            org_id: BD_ORG_ID, firm_id: f.id, contact_id: chosen.c.id, step: 'followup_2',
            subject: emailSubject ? `Re: ${emailSubject}` : '(no subject)',
            first_line: f2Line, body: assembleFollowup2(chosen.c.first_name, f2Line),
            reasoning: { why_firm: 'same firm as the initial email', why_contact: 'same contact as the initial email' },
            status: 'pending',
          });
          if (insErr) results.push({ firm: f.firm_name, error: `followup_2: ${insErr.message}` });
          else stepsAdded.push('followup_2');
        } else {
          results.push({ firm: f.firm_name, skipped: 'follow-up 2 line generation failed — will retry next run' });
        }
      }

      if (stepsAdded.length) {
        made++;
        results.push({ firm: f.firm_name, drafted_steps: stepsAdded, angle: angle.version, proof: proof.key, contact: chosen.c.first_name, flagged: !!f.disqualifier_flags });
      }
    }

    // ── Top-up: firms already mid-sequence, missing their NEXT follow-up ────
    // Firms sent BEFORE 2026-09-12 never got followup_1/followup_2 rows
    // drafted (the old code assembled their text inline at send time). This
    // only tops up bd_sequences.step — the step still AHEAD of them — never
    // a step already sent; there is nothing to backfill for history that
    // already went out under the old template. Reuses the original email's
    // stored contact_id (via bd_sequences), not a re-ranked contact — the
    // thread is already running with that person.
    const room = limit - made;
    if (room > 0) {
      const { data: liveSeqs } = await supabase
        .from('bd_sequences')
        .select('firm_id, contact_id, draft_id, step, bd_firms(firm_name, city, state, research_facts, other_services), bd_contacts(first_name)')
        .eq('org_id', BD_ORG_ID)
        .is('stopped_at', null)
        .in('step', ['followup_1', 'followup_2'])
        .limit(room * 3);

      let topped = 0;
      for (const seq of liveSeqs || []) {
        if (topped >= room) break;
        const f = (seq as Record<string, any>).bd_firms;
        const contact = (seq as Record<string, any>).bd_contacts;
        if (!f || !contact?.first_name) continue;

        const { data: existingRows } = await supabase
          .from('bd_drafts').select('step, subject, first_line').eq('firm_id', seq.firm_id)
          .in('status', ['pending', 'approved', 'scheduled']);
        const existingSteps = new Set((existingRows || []).map((r) => r.step));
        if (existingSteps.has(seq.step)) continue; // already drafted (or already approved/scheduled)

        const facts = (f.research_facts || {}) as Record<string, string[]>;
        const usable: UsableFacts = {
          clients: (facts.clients || []).filter(Boolean), cases: (facts.cases || []).filter(Boolean),
          stack: (facts.stack || []).filter(Boolean), verticals: (facts.verticals || []).filter(Boolean),
        };
        if (!hasOpeningHook(usable)) continue;
        const factLines = factLinesFor(usable);
        const genArgs = { firmName: f.firm_name, city: f.city, state: f.state, factLines };
        const emailSubject = (existingRows || []).find((r) => r.step === 'email_1')?.subject as string | undefined;
        const usedLines = [(existingRows || []).find((r) => r.step === 'email_1')?.first_line as string | undefined].filter(Boolean) as string[];

        const kind = seq.step === 'followup_1' ? 'follow_up_1' as const : 'follow_up_2' as const;
        const line = await generateOpeningLine({ ...genArgs, kind, avoidLines: usedLines });
        if (!line) continue;
        const bodyBuilder = seq.step === 'followup_1' ? assembleFollowup1 : assembleFollowup2;

        const { error } = await supabase.from('bd_drafts').insert({
          org_id: BD_ORG_ID, firm_id: seq.firm_id, contact_id: seq.contact_id, step: seq.step,
          subject: emailSubject ? `Re: ${emailSubject}` : '(no subject)',
          first_line: line, body: bodyBuilder(contact.first_name, line),
          reasoning: { why_firm: 'top-up: mid-sequence firm from before per-step drafting existed', why_contact: 'same contact as the initial email' },
          status: 'pending',
        });
        if (!error) { topped++; results.push({ firm: f.firm_name, top_up: seq.step }); }
      }
      made += topped;
    }

    console.log(`[bd-draft] drafted ${made}`);
    return ok({ success: true, drafted: made, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[bd-draft] fatal:', msg);
    return err(500, msg);
  }
});
