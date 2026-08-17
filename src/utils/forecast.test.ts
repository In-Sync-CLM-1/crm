import { describe, it, expect } from "vitest";
import { forecast, forecastNext, completedPeriods } from "./forecast";

describe("forecast", () => {
  it("refuses to guess from too little history", () => {
    expect(forecast([])).toBeNull();
    expect(forecast([100, 120])).toBeNull();
  });

  it("holds the level for a flat series", () => {
    const f = forecast([100, 100, 100, 100, 100, 100], 3)!;
    expect(f.points.every((p) => Math.abs(p - 100) < 1)).toBe(true);
  });

  it("follows a steady rise, but damped", () => {
    // +10/month. Undamped the next point would be 160; damping keeps it short
    // of that while still projecting above the last observation.
    const f = forecast([100, 110, 120, 130, 140, 150], 1)!;
    expect(f.points[0]).toBeGreaterThan(150);
    expect(f.points[0]).toBeLessThan(160);
  });

  it("is not run away with by a single outlier", () => {
    // One ₹22L month among ordinary ones — the real shape of this business.
    const withSpike = forecast([150000, 180000, 2200000, 160000, 170000, 175000], 1)!;
    expect(withSpike.points[0]).toBeLessThan(900000);
    expect(withSpike.confidence).toBe("low");
  });

  it("never projects a negative amount", () => {
    const f = forecast([500, 300, 200, 100, 50, 10], 4)!;
    expect(f.points.every((p) => p >= 0)).toBe(true);
    expect(f.low.every((p) => p >= 0)).toBe(true);
  });

  it("widens its range the further out it looks", () => {
    const f = forecast([100, 140, 90, 130, 110, 120], 3)!;
    const spread = f.points.map((p, i) => f.high[i] - f.low[i]);
    expect(spread[1]).toBeGreaterThan(spread[0]);
    expect(spread[2]).toBeGreaterThan(spread[1]);
  });

  it("brackets the projection with its range", () => {
    const f = forecast([10, 12, 11, 13, 12, 14], 3)!;
    f.points.forEach((p, i) => {
      expect(f.low[i]).toBeLessThanOrEqual(p);
      expect(f.high[i]).toBeGreaterThanOrEqual(p);
    });
  });

  it("reports a low confidence when recent months disagree wildly", () => {
    expect(forecast([10, 900, 20, 800, 15, 750], 1)!.confidence).toBe("low");
    expect(forecast([100, 105, 98, 102, 101, 99], 1)!.confidence).toBe("moderate");
  });

  it("forecastNext returns the first projected point", () => {
    const hist = [10, 20, 30, 40, 50, 60];
    expect(forecastNext(hist)).toBe(forecast(hist, 1)!.points[0]);
  });
});

describe("completedPeriods", () => {
  it("drops the current, part-finished period", () => {
    expect(completedPeriods([10, 20, 30, 5])).toEqual([10, 20, 30]);
  });

  it("leaves a single observation alone rather than emptying it", () => {
    expect(completedPeriods([7])).toEqual([7]);
    expect(completedPeriods([])).toEqual([]);
  });

  it("does not project zero off the back of a steep decline", () => {
    // Real shape: tickets fell 62→35→12→9→4, then 2 seventeen days into August.
    // Linear decay would run through zero and clamp there; the floor is the
    // quietest month actually observed.
    const withPartial = [62, 35, 12, 9, 4, 2];
    const fitted = forecast(completedPeriods(withPartial), 1)!;
    expect(fitted.points[0]).toBeGreaterThanOrEqual(4);
    expect(forecast(withPartial, 1)!.points[0]).toBeGreaterThanOrEqual(2);
  });

  it("still holds a flat series at its level", () => {
    const f = forecast([100, 100, 100, 100, 100, 100], 2)!;
    expect(f.points.every((p) => Math.abs(p - 100) < 1)).toBe(true);
  });
});
