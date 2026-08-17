import { memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EChart } from "@/components/Marketing/EChart";
import { lineChart, axisRupee, SLOT } from "@/components/Dashboard/chartStyle";
import type { RevenueMonth } from "@/hooks/useDashboardOverview";
import { formatCompactINR } from "@/utils/currency";

/**
 * Ad spend per month. Google only for now — Meta's live promotion runs through
 * Ads Center on an account the API credentials can't read, so putting a Meta
 * series here would draw a flat zero that isn't true.
 */
export const CampaignSpendChart = memo(function CampaignSpendChart({
  data, isLoading,
}: { data?: RevenueMonth[]; isLoading?: boolean }) {
  const rows = data || [];
  const option = useMemo(() => lineChart(
    rows.map((r) => r.month),
    [{ name: "Google Ads", data: rows.map((r) => Math.round(r.google_spend)), color: SLOT.orange, area: true }],
    { valueFormatter: axisRupee },
  ), [rows]);

  if (isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-[200px] w-full mt-3" />
      </Card>
    );
  }

  const total = rows.reduce((s, r) => s + (r.google_spend || 0), 0);

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Campaign spend</h3>
          <p className="text-[11px] text-muted-foreground">Google Ads billing per month</p>
        </div>
        <div className="text-right">
          <div className="text-base font-semibold leading-none">{formatCompactINR(total)}</div>
          <div className="text-[10px] text-muted-foreground">12 months</div>
        </div>
      </div>

      {total === 0 ? (
        <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">
          No ad spend recorded
        </div>
      ) : (
        <EChart option={option} height={200} />
      )}
    </Card>
  );
});
