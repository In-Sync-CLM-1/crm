import { memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EChart } from "@/components/Marketing/EChart";
import { lineChart, axisRupee, SLOT, INK } from "@/components/Dashboard/chartStyle";
import { forecast, completedPeriods } from "@/utils/forecast";
import type { RevenueMonth } from "@/hooks/useDashboardOverview";
import { formatCompactINR, formatCurrency } from "@/utils/currency";

/**
 * Twelve months of billing: what was invoiced against what actually arrived.
 * Both series are rupees, so they share one axis.
 *
 * Replaces "Monthly Revenue by Client", which claimed six months but obeyed the
 * page's date filter, so a single invoice in range drew one floating dot.
 */
/** Labels for the n months after `last` (format "Mon YY"), for the x axis. */
function nextMonthLabels(last: string | undefined, n: number): string[] {
  if (!last) return [];
  const [mon, yy] = last.split(" ");
  const idx = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(mon);
  if (idx < 0) return [];
  const out: string[] = [];
  const d = new Date(2000 + Number(yy), idx, 1);
  for (let i = 0; i < n; i++) {
    d.setMonth(d.getMonth() + 1);
    out.push(`${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]} ${String(d.getFullYear()).slice(2)}`);
  }
  return out;
}

export const MoneyByMonthChart = memo(function MoneyByMonthChart({
  data, isLoading,
}: { data: RevenueMonth[]; isLoading?: boolean }) {
  // Three months of projected receipts, appended to the same axis. Nulls keep
  // the actuals and the projection from being drawn as one continuous line.
  const { option, projection } = useMemo(() => {
    const rows = data || [];
    const received = rows.map((d) => Math.round(d.received));
    // Completed months only: the current month is partial and would bias the
    // trend down every time the dashboard is opened early in a month.
    const f = forecast(completedPeriods(received), 3);

    const futureLabels = f ? nextMonthLabels(rows[rows.length - 1]?.month, 3) : [];
    const categories = [...rows.map((d) => d.month), ...futureLabels];
    const pad = (arr: number[]) => [...arr, ...futureLabels.map(() => null as unknown as number)];

    const series = [
      { name: "Invoiced", data: pad(rows.map((d) => Math.round(d.invoiced))), color: SLOT.blue },
      { name: "Received", data: pad(received), color: SLOT.orange, area: true },
    ];

    if (f) {
      // Joined to the last actual so the forecast continues the line rather
      // than floating away from it.
      const bridge = Array(Math.max(0, rows.length - 1)).fill(null);
      series.push({
        name: "Projected",
        data: [...bridge, received[received.length - 1], ...f.points.map((p) => Math.round(p))] as number[],
        color: INK.muted,
        dashed: true,
      } as never);
    }

    return {
      option: lineChart(categories, series as never, { valueFormatter: axisRupee }),
      projection: f,
    };
  }, [data]);

  if (isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-[240px] w-full mt-3" />
      </Card>
    );
  }

  const hasData = (data || []).some((d) => d.invoiced > 0 || d.received > 0);
  const received = (data || []).reduce((s, d) => s + (d.received || 0), 0);
  const invoiced = (data || []).reduce((s, d) => s + (d.invoiced || 0), 0);

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">Revenue by month</h3>
          <p className="text-[11px] text-muted-foreground">Invoiced against cash actually received, last 12 months</p>
        </div>
        <div className="flex gap-4 text-right">
          <div>
            <div className="font-display text-base font-semibold leading-none">{formatCompactINR(invoiced)}</div>
            <div className="text-[10px] text-muted-foreground">invoiced</div>
          </div>
          <div>
            <div className="font-display text-base font-semibold leading-none">{formatCompactINR(received)}</div>
            <div className="text-[10px] text-muted-foreground">received</div>
          </div>
          {projection && (
            <div>
              <div className="font-display text-base font-semibold leading-none text-muted-foreground">
                {formatCompactINR(projection.points.reduce((a, b) => a + b, 0))}
              </div>
              <div className="text-[10px] text-muted-foreground">next 3 mo (est.)</div>
            </div>
          )}
        </div>
      </div>

      {!hasData ? (
        <div className="h-[240px] flex items-center justify-center text-muted-foreground text-xs">
          No billing recorded yet
        </div>
      ) : (
        <EChart option={option} height={240} />
      )}
      {projection && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Projection: {projection.basis}. Range {formatCompactINR(projection.low[0])}–{formatCompactINR(projection.high[0])} next month
          {projection.confidence === "low" && " — wide, because recent months vary a lot"}.
        </p>
      )}
      <p className="sr-only">
        {(data || []).map((d) => `${d.month}: invoiced ${formatCurrency(d.invoiced)}, received ${formatCurrency(d.received)}`).join(". ")}
      </p>
    </Card>
  );
});
