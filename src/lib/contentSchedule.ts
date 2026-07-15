// Mirrors the rotation logic in supabase/functions/mkt-blog-writer/index.ts so
// the Content Calendar can preview what will be written on a future day BEFORE
// the AI actually writes it (the writer keeps a ~7-day prewritten buffer; days
// beyond that only exist as this deterministic plan).
// Keep in sync with that file if the rotation logic changes there.

export const POSTS_PER_DAY = 4;
export const BUFFER_DAYS = 7;

export const CONTENT_ANGLES = [
  "problem-focused: expose a costly, specific operational pain the ICP lives with daily",
  "transformation-focused: show a before/after contrast with a concrete outcome metric",
  "insight-focused: share a counterintuitive industry data point that reframes the problem",
  "story-focused: walk through a real scenario (anonymised) the ICP will recognise",
  "myth-busting: challenge a common assumption the ICP holds about this problem",
  "cost-of-inaction: quantify what doing nothing costs — time, money, reputation",
  "trend-focused: connect the product to a macro shift happening in the industry right now",
  "question-led: open with a question the ICP has asked themselves but never resolved",
  "social-proof-focused: describe the kind of outcomes peers in their industry are seeing",
];

export const FORMAT_CYCLE = ["text", "image", "carousel", "video", "image", "carousel", "video", "carousel"] as const;

export function daysSince(dateStr: string, referenceDate: string): number {
  const start = new Date(dateStr + "T00:00:00Z").getTime();
  const ref = new Date(referenceDate + "T00:00:00Z").getTime();
  return Math.max(0, Math.floor((ref - start) / 86_400_000));
}

export interface ScheduledPlan {
  day_seq: number;
  product_key: string;
  product_name: string;
  format: string;
  angle: string;
  slot_time: string; // HH:MM IST
}

/** The 4 posts planned for a future day, each with its own posting time. */
export function getScheduledPlans(
  startDate: string,
  targetDate: string,
  products: { product_key: string; product_name: string }[],
  slots: string[],
): ScheduledPlan[] {
  if (!products.length || !slots.length) return [];
  const dayIndex = daysSince(startDate, targetDate);
  return Array.from({ length: POSTS_PER_DAY }, (_, j) => {
    const seq = dayIndex * POSTS_PER_DAY + j;
    const product = products[seq % products.length];
    return {
      day_seq: j,
      product_key: product.product_key,
      product_name: product.product_name,
      format: FORMAT_CYCLE[seq % FORMAT_CYCLE.length],
      angle: CONTENT_ANGLES[seq % CONTENT_ANGLES.length],
      slot_time: slots[seq % slots.length],
    };
  });
}
