// Mirrors the rotation logic in supabase/functions/mkt-blog-writer/index.ts and
// _shared/personaVoice.ts so the Content Calendar can preview what will be
// written on a future day BEFORE the AI actually writes it (the writer keeps a
// ~7-day prewritten buffer; days beyond that only exist as this deterministic
// plan). Keep in sync with those files if the rotation logic changes there.

export const POSTS_PER_DAY = 1; // company page — dropped from 4 on 2026-07-28 (competing posts suppressed reach)
export const BUFFER_DAYS = 7;

// Brand story pillars — every post serves one of these (platform is the hero,
// products are proof points). Mirrors CONTENT_THEMES in mkt-blog-writer.
export const CONTENT_THEMES = [
  "operational efficiency: work should flow through one system instead of being retyped, forwarded, and chased across disconnected tools",
  "cost of fragmentation (loss): the silent leaks — enquiries that die in WhatsApp groups, payments that slip, hours burned reconciling tools that do not talk to each other",
  "brand image: slow replies, missed follow-ups, and inconsistent customer experience quietly teach customers the business is not reliable",
  "team alignment: everyone working from one truth — same contacts, same status, same priorities — instead of private spreadsheets and forgotten threads",
  "productivity: fewer tools, fewer tabs, fewer handoffs — people spend their day on customers, not on coordination",
  "build story: a real, specific chapter of how In-Sync itself got built and rebuilt — told in the BRAND's voice (about the company and its founder), not a generic case study",
];

/** Short label for a theme line ("operational efficiency: ..." → "operational efficiency"). */
export function themeLabel(theme: string): string {
  return theme.split(":")[0];
}

export const CONTENT_ANGLES = [
  "problem-focused: expose a costly, specific operational pain the ICP lives with daily",
  "transformation-focused: show a before/after contrast with a concrete outcome metric",
  "insight-focused: share a counterintuitive industry data point that reframes the problem",
  'case-study: walk through ONE anonymized scenario start to finish — the state before (vivid and specific), the tension that made it unsustainable, what changed, the outcome. A scene with stakes, not a generic "imagine a company" — never name a real client, never invent a number that reads as a verified case-study metric, keep figures illustrative or omit them',
  "myth-busting: name a belief the ICP genuinely holds and take a real position against it — not a strawman nobody actually believes. The disagreement should be real enough that some readers push back in the comments",
  "cost-of-inaction: quantify what doing nothing costs — time, money, reputation",
  "trend-focused: connect the product to a macro shift happening in the industry right now",
  "question-led: open with a question the ICP has asked themselves but never resolved",
  "social-proof-focused: describe the kind of outcomes peers in their industry are seeing",
];

export const FORMAT_CYCLE = ["text", "image", "carousel", "poll", "product", "image", "carousel", "video", "carousel"] as const;

// ── Persona stream (Amit's own LinkedIn profile) ────────────────────────────
// Separate channel from the company page: one first-person post on weekdays
// only, fixed 08:30 IST slot, never selling. Mirrors _shared/personaVoice.ts.
export const PERSONA_DAY_SEQ = 4; // company posts use day_seq 0
export const PERSONA_SLOT_INDEX = 1; // 08:30 IST

export const PERSONA_PILLARS = [
  "founder journey: a real decision, trade-off, or mistake from Amit's story and what it taught him",
  "business run by AI: a concrete, honest look at what it is like to run a company where AI does the building and the operating",
  "opinion: a conviction about how Indian SMBs buy and use software that most people get wrong",
  "operator advice: one practical, immediately usable lesson for founders/ops heads of scaling businesses",
  "market observation: an anonymized pattern across growing Indian businesses — what separates the ones that scale cleanly from the ones that fracture",
  "case study: walk through ONE anonymized situation start to finish — the state before, the tension, what changed, the outcome",
];

export const PERSONA_ANCHOR_PILLAR =
  "anchor (weekly reference post): one concrete operational breakdown from accounts-payable/vendor-management reality, walked through step by step, plus one defensible contrarian position";

export function daysSince(dateStr: string, referenceDate: string): number {
  const start = new Date(dateStr + "T00:00:00Z").getTime();
  const ref = new Date(referenceDate + "T00:00:00Z").getTime();
  return Math.max(0, Math.floor((ref - start) / 86_400_000));
}

// 0=Sun..6=Sat, IST-dated string. Used to gate the persona stream to weekdays,
// land the weekly anchor on Wednesday, and the biweekly poll on Friday.
function dayOfWeek(dateStr: string): number {
  return new Date(dateStr + "T00:00:00Z").getUTCDay();
}

export interface ScheduledPlan {
  day_seq: number;
  channel: "company" | "member";
  product_key: string | null;
  product_name: string | null; // proof-point product woven into the brand story (company channel only)
  format: string;
  angle: string;
  theme: string; // brand story pillar / persona pillar the post serves
  slot_time: string; // HH:MM IST
}

/**
 * The posts planned for a future day: 1 company post, plus (weekdays only) 1
 * first-person post from Amit's own profile. Each with its own posting time.
 */
export function getScheduledPlans(
  startDate: string,
  targetDate: string,
  products: { product_key: string; product_name: string }[],
  slots: string[],
): ScheduledPlan[] {
  if (!products.length || !slots.length) return [];
  const dayIndex = daysSince(startDate, targetDate);
  const plans: ScheduledPlan[] = [];

  // Company page — day_seq 0, one post/day.
  const postSeq = dayIndex * POSTS_PER_DAY;
  const product = products[postSeq % products.length];
  plans.push({
    day_seq: 0,
    channel: "company",
    product_key: product.product_key,
    product_name: product.product_name,
    format: FORMAT_CYCLE[postSeq % FORMAT_CYCLE.length],
    angle: CONTENT_ANGLES[postSeq % CONTENT_ANGLES.length],
    theme: CONTENT_THEMES[postSeq % CONTENT_THEMES.length],
    slot_time: slots[postSeq % slots.length],
  });

  // Persona (Amit's profile) — weekdays only, 5/week.
  const dow = dayOfWeek(targetDate);
  const isWeekday = dow !== 0 && dow !== 6;
  if (isWeekday) {
    const isAnchorDay = dow === 3; // Wednesday
    const isPollDay = dow === 5 && Math.floor(dayIndex / 7) % 2 === 0; // every other Friday

    if (isPollDay) {
      plans.push({
        day_seq: PERSONA_DAY_SEQ,
        channel: "member",
        product_key: null,
        product_name: null,
        format: "poll",
        angle: "persona: poll, never selling",
        theme: "poll: a question Amit would genuinely be curious how his network answers",
        slot_time: slots[PERSONA_SLOT_INDEX % slots.length],
      });
    } else {
      const pillar = isAnchorDay ? PERSONA_ANCHOR_PILLAR : PERSONA_PILLARS[dayIndex % PERSONA_PILLARS.length];
      plans.push({
        day_seq: PERSONA_DAY_SEQ,
        channel: "member",
        product_key: null,
        product_name: null,
        format: "text",
        angle: "persona: first-person, story-led, never selling",
        theme: pillar,
        slot_time: slots[PERSONA_SLOT_INDEX % slots.length],
      });
    }
  }

  return plans;
}
