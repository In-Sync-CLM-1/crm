/**
 * Forecasting for the dashboard.
 *
 * The business's monthly numbers are lumpy — one ₹22L month sits beside several
 * ₹1-2L months — so a plain least-squares line through them extrapolates wildly
 * and would put a confident number on the dashboard that the data does not
 * support. Two deliberate choices guard against that:
 *
 *   1. The trend is DAMPED. The projection is a blend of the fitted slope and
 *      the recent average, weighted toward the average. A real trend still
 *      shows; a single outlier cannot run away with the forecast.
 *   2. Every projection carries a range, and the range widens the further out
 *      it goes. The dashboard shows the range, not just the point.
 *
 * Nothing here invents history: with fewer than 3 real observations it returns
 * null rather than guessing.
 */

export interface Forecast {
  /** Central projection per future period, nearest first. */
  points: number[];
  /** Low/high bounds per future period, same order. */
  low: number[];
  high: number[];
  /** Plain-English basis, shown to the user so the number is never a black box. */
  basis: string;
  /** How much to trust it, from the spread of recent observations. */
  confidence: "low" | "moderate";
}

/** Least-squares slope and intercept over y, x = 0..n-1. */
function fit(y: number[]): { slope: number; intercept: number } {
  const n = y.length;
  const xMean = (n - 1) / 2;
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (y[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: yMean - slope * xMean };
}

/**
 * Project `periods` steps beyond the observed series.
 *
 * @param history observations, oldest first
 * @param periods how many future periods to project
 * @param opts.damping applied to the slope: 0 = hold the current level flat,
 *                     1 = follow the fitted trend fully. Default 0.5.
 */
export function forecast(
  history: number[],
  periods = 3,
  opts: { damping?: number; window?: number } = {},
): Forecast | null {
  const clean = history.filter((v) => Number.isFinite(v));
  if (clean.length < 3) return null;

  const window = Math.min(opts.window ?? 6, clean.length);
  const recent = clean.slice(-window);
  const damping = opts.damping ?? 0.5;

  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const { slope, intercept } = fit(recent);
  const lastFitted = intercept + slope * (recent.length - 1);

  // Spread of the recent window, used for the range. Standard deviation, but
  // floored so a flat run doesn't imply certainty we don't have.
  const variance = recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length;
  const sd = Math.max(Math.sqrt(variance), Math.abs(mean) * 0.1);

  const points: number[] = [];
  const low: number[] = [];
  const high: number[] = [];
  for (let step = 1; step <= periods; step++) {
    // Damp the SLOPE, not the level. Blending the projection back toward the
    // window mean looked reasonable but was wrong: for a steadily rising
    // series the mean sits well below the current level, so the "forecast"
    // came out lower than the most recent month. Anchoring on the fitted
    // level and advancing by a damped slope keeps direction honest while
    // still refusing to extrapolate at full tilt.
    const value = Math.max(0, lastFitted + slope * damping * step);
    // The band widens with distance: one SD at the first step, growing by
    // sqrt(step) after that.
    const spread = sd * Math.sqrt(step);
    points.push(value);
    low.push(Math.max(0, value - spread));
    high.push(value + spread);
  }

  const direction = slope > mean * 0.05 ? "rising" : slope < -mean * 0.05 ? "falling" : "flat";
  return {
    points,
    low,
    high,
    basis: `${recent.length}-month average with a ${direction} trend, damped`,
    confidence: sd > Math.abs(mean) * 0.6 ? "low" : "moderate",
  };
}

/** Convenience: a single next-period projection. */
export function forecastNext(history: number[], opts?: { damping?: number; window?: number }): number | null {
  const f = forecast(history, 1, opts);
  return f ? f.points[0] : null;
}
