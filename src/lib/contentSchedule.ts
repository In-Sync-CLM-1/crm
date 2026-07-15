// Mirrors the rotation logic in supabase/functions/mkt-blog-writer/index.ts so
// the Content Calendar can preview what will be written on a future day BEFORE
// the AI actually writes it (blog_posts only ever holds tomorrow's row at most).
// Keep in sync with that file if the rotation logic changes there.

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
  product_key: string;
  product_name: string;
  format: string;
  angle: string;
}

export function getScheduledPlan(
  startDate: string,
  targetDate: string,
  products: { product_key: string; product_name: string }[],
): ScheduledPlan | null {
  if (!products.length) return null;
  const dayIndex = daysSince(startDate, targetDate);
  const product = products[dayIndex % products.length];
  return {
    product_key: product.product_key,
    product_name: product.product_name,
    format: FORMAT_CYCLE[dayIndex % FORMAT_CYCLE.length],
    angle: CONTENT_ANGLES[dayIndex % CONTENT_ANGLES.length],
  };
}
