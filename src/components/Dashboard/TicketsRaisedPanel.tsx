import { memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { EChart } from "@/components/Marketing/EChart";
import { barChart, SLOT } from "@/components/Dashboard/chartStyle";
import type { DashboardOverview } from "@/hooks/useDashboardOverview";

/**
 * Tickets raised. Deliberately compact — it used to take a full-width block
 * with a 200px chart for what is, most months, a single-digit number.
 */
export const TicketsRaisedPanel = memo(function TicketsRaisedPanel({
  data, isLoading,
}: { data?: DashboardOverview["tickets"]; isLoading?: boolean }) {
  const monthly = data?.monthly || [];
  const option = useMemo(() => barChart(
    monthly.map((m) => m.month),
    [{ name: "Raised", data: monthly.map((m) => m.raised), color: SLOT.blue }],
    { minInterval: 1 },
  ), [monthly]);

  if (isLoading || !data) {
    return <Card className="p-4"><Skeleton className="h-4 w-32" /><Skeleton className="h-[110px] w-full mt-3" /></Card>;
  }

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Tickets raised</h3>
          <p className="text-[11px] text-muted-foreground">Per month, last 12 months</p>
        </div>
        <Link to="/support-tickets" className="text-[10px] text-primary inline-flex items-center gap-0.5 hover:underline">
          Open <ExternalLink className="h-2.5 w-2.5" />
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="shrink-0 grid grid-cols-3 gap-2 text-center w-[132px]">
          <div>
            <div className="text-base font-semibold leading-none">{data.raised_30d}</div>
            <div className="text-[9px] text-muted-foreground">30 days</div>
          </div>
          <div>
            <div className="text-base font-semibold leading-none">{data.open}</div>
            <div className="text-[9px] text-muted-foreground">open</div>
          </div>
          <div>
            <div className={`text-base font-semibold leading-none ${data.overdue > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>
              {data.overdue}
            </div>
            <div className="text-[9px] text-muted-foreground">overdue</div>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <EChart option={option} height={96} />
        </div>
      </div>

      {data.overdue > 0 && (
        <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          all {data.overdue} open tickets are past their due date
        </p>
      )}
    </Card>
  );
});
