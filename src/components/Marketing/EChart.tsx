import { useEffect, useRef } from "react";
import * as echarts from "echarts";

/**
 * Thin React wrapper around echarts — init on mount, setOption on change,
 * resize with the container, dispose on unmount.
 */
export function EChart({ option, height = 280 }: { option: echarts.EChartsOption; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={ref} style={{ width: "100%", height }} />;
}
