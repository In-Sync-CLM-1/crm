import { memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EChart } from "@/components/Marketing/EChart";
import { lineChart, axisRupee, SLOT } from "@/components/Dashboard/chartStyle";
import type { RevenueMonth } from "@/hooks/useDashboardOverview";
import { formatCompactINR, formatCurrency } from "@/utils/currency";

/**
 * Twelve months of billing: what was invoiced against what actually arrived.
 * Both series are rupees, so they share one axis.
 *
 * Replaces "Monthly Revenue by Client", which claimed six months but obeyed the
 * page's date filter, so a single invoice in range drew one floating dot.
 */
export const MoneyByMonthChart = memo(function MoneyByMonthChart({
  data, isLoading,
}: { data: RevenueMonth[]; isLoading?: boolean }) {
  const option = useMemo(() => lineChart(
    (data || []).map((d) => d.month),
    [
      { name: "Invoiced", data: (data || []).map((d) => Math.round(d.invoiced)), color: SLOT.blue },
      { name: "Received", data: (data || []).map((d) => Math.round(d.received)), color: SLOT.orange, area: true },
    ],
    { valueFormatter: axisRupee },
  ), [data]);

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
          <h3 className="text-sm font-semibold">Revenue by month</h3>
          <p className="text-[11px] text-muted-foreground">Invoiced against cash actually received, last 12 months</p>
        </div>
        <div className="flex gap-4 text-right">
          <div>
            <div className="text-base font-semibold leading-none">{formatCompactINR(invoiced)}</div>
            <div className="text-[10px] text-muted-foreground">invoiced</div>
          </div>
          <div>
            <div className="text-base font-semibold leading-none">{formatCompactINR(received)}</div>
            <div className="text-[10px] text-muted-foreground">received</div>
          </div>
        </div>
      </div>

      {!hasData ? (
        <div className="h-[240px] flex items-center justify-center text-muted-foreground text-xs">
          No billing recorded yet
        </div>
      ) : (
        <EChart option={option} height={240} />
      )}
      <p className="sr-only">
        {(data || []).map((d) => `${d.month}: invoiced ${formatCurrency(d.invoiced)}, received ${formatCurrency(d.received)}`).join(". ")}
      </p>
    </Card>
  );
});
