/**
 * Canonical writing style for any copy drafted AS A PERSON, TO A PERSON —
 * cold outreach, follow-ups, LinkedIn/WhatsApp DMs, anything that carries a
 * human signature. Established 2026-09-14 after BD outreach's follow-up 1
 * and follow-up 2 scaffolds read as templated and abrupt, not like one
 * person writing to another (see PR #103).
 *
 * Does NOT apply to system/transactional messages — OTPs, alerts, receipts,
 * status notifications. Those stay terse by design (see the fleet's
 * failure-only-alerts and flat-quote rules); warming those up would be the
 * wrong fix.
 *
 * Any function that asks an LLM to draft outbound human copy should splice
 * this into the prompt. Any hand-written scaffold (fixed body text with a
 * generated line dropped in, like BD outreach's follow-ups) should be
 * checked against it by hand instead — it is a checklist either way.
 */
export const HUMAN_WRITING_STYLE = `
Write the way one person actually writes to another, not the way a template
assembles facts in order. Check the draft against all five before it's done:

1. ACKNOWLEDGE CONTINUITY — if this isn't the first message in a thread, open
   by naming that naturally ("Following up on my note last week"), never by
   jumping straight into new content as if this were the first contact.
2. BRIDGE, DON'T PIVOT — every sentence should connect to the one before it
   with a transition, not sit next to it as an unrelated fact bolted on.
3. DON'T PRESUME — never write as if a future interaction (a call, a meeting,
   a reply) has already been agreed to. Invite, don't presume — "Happy to
   walk through it whenever you have a few minutes," not "before we talk."
4. SOFTEN BLUNT STATEMENTS — a flat, transactional declarative ("Last note
   from me") reads cold. Say the same fact with more courtesy ("I don't want
   to keep cluttering your inbox, so I'll leave it here for now").
5. CLOSE WARMLY — a sign-off phrase ("Best," / "Thanks,") before the name,
   always. A bare name with no closing phrase reads unfinished.
`;
