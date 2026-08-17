import type { EChartsOption } from "echarts";

/**
 * Shared echarts styling for the dashboard, matching Social Performance so the
 * two pages read as one system. Lines and areas only — no bar charts, per
 * Amit's standing preference.
 *
 * Colours are the validated categorical slots (fixed order, colour follows the
 * measure and never its rank).
 */
export const INK = {
  primary: "#0b0b0b",
  secondary: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
};

export const SLOT = {
  blue: "#2a78d6",
  orange: "#eb6834",
  aqua: "#1baf7a",
  yellow: "#eda100",
};

export const axisCommon = {
  axisLine: { lineStyle: { color: INK.axis } },
  axisLabel: { color: INK.muted, fontSize: 11 },
  splitLine: { lineStyle: { color: INK.grid } },
};

/** Rupees on an axis: ₹1.2Cr / ₹3.4L / ₹12K. */
export function axisRupee(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${Math.round(value / 1000)}K`;
  return `₹${value}`;
}

interface LineSpec {
  name: string;
  data: number[];
  color: string;
  area?: boolean;
  /** Dashed = projected, not measured. Always label such a series clearly. */
  dashed?: boolean;
}

/**
 * One time-series chart: smooth lines, optional soft area fill, crosshair
 * tooltip, legend only when more than one measure is plotted.
 */
export function lineChart(
  categories: string[],
  series: LineSpec[],
  opts: { valueFormatter?: (v: number) => string; minInterval?: number } = {},
): EChartsOption {
  const fmt = opts.valueFormatter || ((v: number) => String(v));
  return {
    color: series.map((s) => s.color),
    grid: { left: 52, right: 16, top: series.length > 1 ? 30 : 12, bottom: 28 },
    legend: series.length > 1
      ? { top: 0, left: 0, icon: "circle", itemWidth: 8, itemHeight: 8, textStyle: { color: INK.secondary, fontSize: 11 } }
      : { show: false },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross", label: { show: false } },
      valueFormatter: (v) => fmt(Number(v)),
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: categories,
      ...axisCommon,
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      ...axisCommon,
      axisLine: { show: false },
      axisLabel: { ...axisCommon.axisLabel, formatter: (v: number) => fmt(v) },
      ...(opts.minInterval ? { minInterval: opts.minInterval } : {}),
    },
    series: series.map((s) => ({
      name: s.name,
      type: "line" as const,
      // Straight segments with visible points. Spline smoothing on twelve
      // monthly readings invents shape between them: a single month of ad
      // spend became a bell curve spanning three, and the revenue line dipped
      // below zero between points where nothing negative exists.
      smooth: false,
      symbol: s.dashed ? ("emptyCircle" as const) : ("circle" as const),
      symbolSize: 5,
      showSymbol: true,
      // Dashed = projected, not measured.
      lineStyle: { width: 2, ...(s.dashed ? { type: "dashed" as const } : {}) },
      ...(s.area
        ? {
            areaStyle: {
              opacity: 0.12,
              color: s.color,
            },
          }
        : {}),
      data: s.data,
    })),
  };
}
