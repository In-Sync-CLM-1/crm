import { memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EChart } from "@/components/Marketing/EChart";
import { barChart, axisRupee, SLOT } from "@/components/Dashboard/chartStyle";
import type { RevenueMonth } from "@/hooks/useDashboardOverview";
import { formatCompactINR } from "@/utils/currency";

/**
 * Ad spend per month — bars, because each month is a discrete billed amount
 * rather than a continuous quantity moving between readings.
 *
 * Google only: Meta's live promotion runs on an ad account the credentials
 * cannot read, so a Meta series here would be a row of zeros that isn't true.
 */
export const CampaignSpendChart = memo(function CampaignSpendChart({
  data, isLoading,
}: { data?: RevenueMonth[]; isLoading?: boolean }) {
  const rows = data || [];
  const option = useMemo(() => barChart(
    rows.map((r) => r.month),
    [{ name: "Google Ads", data: rows.map((r) => Math.round(r.google_spend)), color: SLOT.orange }],
    { valueFormatter: axisRupee },
  ), [rows]);

  if (isLoading) {
    return <Card className="p-4"><Skeleton className="h-4 w-36" /><Skeleton className="h-[170px] w-full mt-3" /></Card>;
  }

  const total = rows.reduce((s, r) => s + (r.google_spend || 0), 0);
  const active = rows.filter((r) => r.google_spend > 0).length;

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Campaign spend</h3>
          <p className="text-[11px] text-muted-foreground">Google Ads billed per month</p>
        </div>
        <div className="text-right">
          <div className="text-base font-semibold leading-none">{formatCompactINR(total)}</div>
          <div className="text-[10px] text-muted-foreground">{active} of 12 months active</div>
        </div>
      </div>

      {total === 0
        ? <div className="h-[170px] flex items-center justify-center text-xs text-muted-foreground">No ad spend recorded</div>
        : <EChart option={option} height={170} />}
    </Card>
  );
});
