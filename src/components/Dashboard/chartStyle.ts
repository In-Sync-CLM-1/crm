import type { EChartsOption } from "echarts";

/**
 * Shared echarts styling for the dashboard.
 *
 * Each measure gets the chart form that suits it rather than one line chart
 * repeated: a time series is a line, discrete months are bars, a stage-by-stage
 * process is a funnel, a single figure against a target is a gauge, and a split
 * of one total is a donut.
 *
 * Colours are the validated categorical slots, assigned in fixed order — colour
 * follows the entity, never its rank, so a filter can't repaint the survivors.
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
  magenta: "#e87ba4",
  violet: "#4a3aa7",
};

/** Fixed channel → colour, so LinkedIn is always the same blue everywhere. */
export const CHANNEL_COLOR: Record<string, string> = {
  linkedin: SLOT.blue,
  facebook: SLOT.violet,
  instagram: SLOT.magenta,
  youtube: SLOT.orange,
  x: SLOT.aqua,
};

export const axisCommon = {
  axisLine: { lineStyle: { color: INK.axis } },
  axisLabel: { color: INK.muted, fontSize: 11 },
  splitLine: { lineStyle: { color: INK.grid } },
};

const TOOLTIP = {
  backgroundColor: "#ffffff",
  borderColor: INK.grid,
  borderWidth: 1,
  textStyle: { color: INK.primary, fontSize: 11 },
  extraCssText: "box-shadow:0 2px 8px rgba(0,0,0,.08);border-radius:6px;",
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
  data: (number | null)[];
  color: string;
  area?: boolean;
  /** Dashed = projected, not measured. Always label such a series clearly. */
  dashed?: boolean;
}

/** A time series: straight segments, visible points, crosshair tooltip. */
export function lineChart(
  categories: string[],
  series: LineSpec[],
  opts: { valueFormatter?: (v: number) => string; minInterval?: number; height?: number } = {},
): EChartsOption {
  const fmt = opts.valueFormatter || ((v: number) => String(v));
  return {
    color: series.map((s) => s.color),
    grid: { left: 54, right: 16, top: series.length > 1 ? 28 : 12, bottom: 26 },
    legend: series.length > 1
      ? { top: 0, left: 0, icon: "circle", itemWidth: 8, itemHeight: 8, textStyle: { color: INK.secondary, fontSize: 11 } }
      : { show: false },
    tooltip: { trigger: "axis", axisPointer: { type: "cross", label: { show: false } }, ...TOOLTIP, valueFormatter: (v) => fmt(Number(v)) },
    xAxis: { type: "category", boundaryGap: false, data: categories, ...axisCommon, splitLine: { show: false } },
    yAxis: {
      type: "value", ...axisCommon, axisLine: { show: false },
      axisLabel: { ...axisCommon.axisLabel, formatter: (v: number) => fmt(v) },
      ...(opts.minInterval ? { minInterval: opts.minInterval } : {}),
    },
    series: series.map((s) => ({
      name: s.name,
      type: "line" as const,
      // Never smooth a monthly series: spline smoothing invented a three-month
      // bell curve out of one month of ad spend, and dipped revenue below zero.
      smooth: false,
      symbol: s.dashed ? ("emptyCircle" as const) : ("circle" as const),
      symbolSize: 5,
      showSymbol: true,
      lineStyle: { width: 2, ...(s.dashed ? { type: "dashed" as const } : {}) },
      ...(s.area ? { areaStyle: { opacity: 0.1, color: s.color } } : {}),
      data: s.data,
    })),
  };
}

/** Discrete values per period — one bar each, rounded data-ends. */
export function barChart(
  categories: string[],
  series: { name: string; data: number[]; color: string }[],
  opts: { valueFormatter?: (v: number) => string; horizontal?: boolean; minInterval?: number } = {},
): EChartsOption {
  const fmt = opts.valueFormatter || ((v: number) => String(v));
  const valueAxis = {
    type: "value" as const, ...axisCommon, axisLine: { show: false },
    axisLabel: { ...axisCommon.axisLabel, formatter: (v: number) => fmt(v) },
    ...(opts.minInterval ? { minInterval: opts.minInterval } : {}),
  };
  const catAxis = { type: "category" as const, data: categories, ...axisCommon, splitLine: { show: false } };
  return {
    color: series.map((s) => s.color),
    grid: { left: opts.horizontal ? 78 : 54, right: 16, top: series.length > 1 ? 28 : 12, bottom: 26 },
    legend: series.length > 1
      ? { top: 0, left: 0, icon: "roundRect", itemWidth: 9, itemHeight: 9, textStyle: { color: INK.secondary, fontSize: 11 } }
      : { show: false },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...TOOLTIP, valueFormatter: (v) => fmt(Number(v)) },
    xAxis: opts.horizontal ? valueAxis : catAxis,
    yAxis: opts.horizontal ? catAxis : valueAxis,
    series: series.map((s) => ({
      name: s.name,
      type: "bar" as const,
      // 2px gap between adjacent bars, rounded on the data end only.
      barGap: "12%",
      barMaxWidth: 18,
      itemStyle: { borderRadius: opts.horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
      data: s.data,
    })),
  };
}

/** A split of one total. Donut, never a pie — the hole carries the headline. */
export function donutChart(
  slices: { name: string; value: number; color: string }[],
  opts: { center?: string; valueFormatter?: (v: number) => string } = {},
): EChartsOption {
  const fmt = opts.valueFormatter || ((v: number) => String(v));
  return {
    color: slices.map((s) => s.color),
    tooltip: { trigger: "item", ...TOOLTIP, valueFormatter: (v) => fmt(Number(v)) },
    legend: {
      orient: "vertical", right: 0, top: "middle", icon: "circle",
      itemWidth: 8, itemHeight: 8, textStyle: { color: INK.secondary, fontSize: 11 },
    },
    series: [{
      type: "pie",
      radius: ["58%", "82%"],
      center: ["34%", "50%"],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: "#fff", borderWidth: 2 },
      label: { show: false },
      emphasis: { scale: true, scaleSize: 4 },
      data: slices.filter((s) => s.value > 0),
    }],
  };
}

/** A stage-by-stage process, widest first. */
export function funnelChart(
  stages: { name: string; value: number; color: string }[],
): EChartsOption {
  const max = Math.max(...stages.map((s) => s.value), 1);
  return {
    color: stages.map((s) => s.color),
    tooltip: {
      trigger: "item", ...TOOLTIP,
      formatter: (p: unknown) => {
        const q = p as { name: string; value: number };
        const top = stages[0]?.value || 1;
        return `<b>${q.name}</b><br/>${q.value.toLocaleString("en-IN")} · ${Math.round((q.value / top) * 100)}% of sourced`;
      },
    },
    series: [{
      type: "funnel",
      left: "34%", right: "4%", top: 6, bottom: 6,
      min: 0, max,
      minSize: "16%", maxSize: "100%",
      sort: "none",
      gap: 3,
      label: {
        show: true, position: "left",
        formatter: (p: unknown) => {
          const q = p as { name: string; value: number };
          return `${q.name}  ${q.value.toLocaleString("en-IN")}`;
        },
        fontSize: 11, color: INK.secondary,
      },
      labelLine: { show: true, length: 12, lineStyle: { color: INK.axis } },
      itemStyle: { borderColor: "#fff", borderWidth: 2 },
      data: stages.map((s) => ({ name: s.name, value: s.value })),
    }],
  };
}

/** One figure against a ceiling — a progress ring, no needle. */
export function gaugeChart(
  value: number,
  max: number,
  opts: { color?: string; label?: string; formatter?: (v: number) => string } = {},
): EChartsOption {
  const color = opts.color || SLOT.blue;
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return {
    series: [{
      type: "gauge",
      startAngle: 200, endAngle: -20,
      min: 0, max: 100,
      radius: "94%", center: ["50%", "64%"],
      progress: { show: true, roundCap: true, width: 10, itemStyle: { color } },
      pointer: { show: false },
      axisLine: { roundCap: true, lineStyle: { width: 10, color: [[1, INK.grid]] } },
      axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
      anchor: { show: false }, title: { show: false },
      detail: {
        valueAnimation: true, fontSize: 20, fontWeight: "bold", color,
        formatter: () => (opts.formatter ? opts.formatter(value) : `${pct}%`),
        offsetCenter: [0, "-4%"],
      },
      data: [{ value: pct }],
    }],
  };
}
