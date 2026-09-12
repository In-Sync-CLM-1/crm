/**
 * bd-draft — assemble a review-ready email for each eligible firm.
 *
 * The angle, the proof and the body are deterministic: they follow the rules in
 * _shared/bdPipeline.ts. Only the FIRST LINE is generated, because it is the
 * one part that has to name something specific about this firm and say what it
 * implies. Everything else is chosen, not invented.
 *
 * Drafts land in the review queue as `pending`. Nothing sends unreviewed.
 *
 *   POST { limit: 5 }
 */
import { callLLM } from '../_shared/llmClient.ts';
import { BD_ORG_ID, pickAngle, pickProof, scoreContact, PROOFS, type FirmRow } from '../_shared/bdPipeline.ts';
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

      const { data: existing } = await supabase
        .from('bd_drafts').select('id').eq('firm_id', f.id)
        .in('status', ['pending', 'approved', 'scheduled']).maybeSingle();
      if (existing) continue;

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
      const usable = {
        clients: (facts.clients || []).filter(Boolean),
        cases: (facts.cases || []).filter(Boolean),
        stack: (facts.stack || []).filter(Boolean),
        verticals: (facts.verticals || []).filter(Boolean),
      };
      // A named client or a case study title is a real hook. Stack alone only
      // counts when it is a distinctive platform — "AWS" is true of everyone.
      const hasHook = usable.clients.length > 0 || usable.cases.length > 0 || usable.stack.length > 0;
      if (!hasHook) {
        results.push({ firm: f.firm_name, skipped: 'no named client, case study or distinctive stack item — nothing specific to open on' });
        continue;
      }

      // Only non-empty categories reach the prompt: a printed "none" is
      // something the model will comment on.
      const factLines = Object.entries(usable)
        .filter(([, v]) => v.length)
        .map(([k, v]) => `  ${k}: ${v.slice(0, 10).join(', ')}`)
        .join('\n');

      const prompt = `You write one opening line for a cold email to a US software consultancy. Peer to peer, never an applicant.

FIRM: ${f.firm_name} — ${f.city}, ${f.state}
VERBATIM FACTS FETCHED FROM THEIR SITE:
${factLines}

RULES
- Name ONE specific thing from the facts above: a client, a case title, a stack item.
- Make it unmistakable that thing is THEIRS — "your client X", "the X case study on your site",
  "you built X" — before you say what it implies. A proper noun stated with no ownership
  context reads as a non-sequitur to a stranger who has never heard of it.
  good: "AS/400 on your stack page in 2026 means clients who can't move and won't be told to."
  good: "Your Dedica Health case study is a remote patient-monitoring build — a regulated,
         can't-be-wrong kind of client."
  bad:  "Impressive work with legacy systems." (no implication, just praise)
  bad:  "Dedica Health indicates a focus on remote patient care." (states a name with no
         ownership context — reads as a fact about a stranger, not a remark to one)
- Write about THEM. Never mention yourself, your firm, or what you noticed.
- Never say anything critical about the firm or its size.
- One or two COMPLETE sentences, ending in a period. No adjectives. No exclamation marks.

Return only the line.`;

      // Anything that reads as self-referential, hedged, or critical is
      // rejected outright — these are the shapes a small model falls into when
      // the facts are thin, and every one of them undoes the email.
      const BAD_LINE = /\b(I noticed|I saw|our firm|we also|suggesting|implying|may indicate|might indicate|could indicate|may suggest|likely means|probably|may not|might not|appears to|seems to|unfortunately|impressive|great job|none)\b/i;

      let firstLine = '';
      for (let attempt = 0; attempt < 2 && !firstLine; attempt++) {
        try {
          // gpt-oss (the haiku tier's real model, via Groq/Cerebras) is a
          // reasoning model — it spends tokens on a hidden reasoning block
          // that shares the same max_tokens budget as the visible answer.
          // Left at the provider default this occasionally cut the actual
          // line off mid-sentence ("Their Oracle stack implies they" —
          // confirmed live, 2026-09-11): 157 of 200 tokens went to invisible
          // reasoning in one measured call, and nothing was checking that the
          // line actually ended. reasoning_effort: 'low' cut that to 24 in
          // the same test, so 200 tokens is plenty again without needing to
          // widen the budget (which would just slow every call down).
          const res = await callLLM(prompt, { max_tokens: 200, temperature: attempt === 0 ? 0.6 : 0.8, reasoning_effort: 'low' });
          const line = String(res.content ?? '').trim().replace(/^["']|["']$/g, '');
          // A line that opens with the firm's own name reads as a report about
          // them rather than a remark to them.
          const startsWithName = line.toLowerCase().startsWith(String(f.firm_name).toLowerCase());
          // Requires the line to actually tie its named fact back to the
          // reader ("your", "you", "you've") — the Dedica Health failure named
          // a real, grounded fact but stated it as if the reader already knew
          // who that was, with nothing connecting it to "your site/client/work".
          const hasOwnershipMarker = /\byou(r|'?re|'?ve)?\b/i.test(line);
          // A line cut off mid-sentence (no terminal punctuation) passed every
          // other check before — reject it the same way a bad implication gets
          // rejected, rather than silently sending half a thought.
          const endsComplete = /[.!?]['")\]]?$/.test(line);
          if (line && line.length > 25 && line.length < 320 && !BAD_LINE.test(line)
            && !startsWithName && hasOwnershipMarker && endsComplete) firstLine = line;
        } catch (e) {
          results.push({ firm: f.firm_name, skipped: `line generation failed: ${e instanceof Error ? e.message : String(e)}` });
          break;
        }
      }

      if (!firstLine) {
        results.push({ firm: f.firm_name, skipped: 'could not produce a usable first line from these facts — left for a human' });
        continue;
      }

      const subjects = SUBJECTS[angle.version];
      const subject = subjects[made % subjects.length];
      const closer = CLOSERS[made % CLOSERS.length];
      const draftBody = assemble(angle.version, chosen.c.first_name, firstLine, PROOFS[proof.key].text, closer);

      const { error: insErr } = await supabase.from('bd_drafts').insert({
        org_id: BD_ORG_ID,
        firm_id: f.id,
        contact_id: chosen.c.id,
        angle_version: angle.version,
        proof_key: proof.key,
        subject,
        first_line: firstLine,
        body: draftBody,
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
      if (insErr) { results.push({ firm: f.firm_name, error: insErr.message }); continue; }

      made++;
      results.push({ firm: f.firm_name, angle: angle.version, proof: proof.key, contact: chosen.c.first_name, flagged: !!f.disqualifier_flags });
    }

    console.log(`[bd-draft] drafted ${made}`);
    return ok({ success: true, drafted: made, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[bd-draft] fatal:', msg);
    return err(500, msg);
  }
});
