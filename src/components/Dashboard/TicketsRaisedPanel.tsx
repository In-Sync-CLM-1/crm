import { memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { EChart } from "@/components/Marketing/EChart";
import { lineChart, SLOT } from "@/components/Dashboard/chartStyle";
import type { DashboardOverview } from "@/hooks/useDashboardOverview";

/** Tickets raised per month, with what is still open and what has slipped. */
export const TicketsRaisedPanel = memo(function TicketsRaisedPanel({
  data, isLoading,
}: { data?: DashboardOverview["tickets"]; isLoading?: boolean }) {
  const monthly = data?.monthly || [];
  const option = useMemo(() => lineChart(
    monthly.map((m) => m.month),
    [{ name: "Raised", data: monthly.map((m) => m.raised), color: SLOT.blue, area: true }],
    { minInterval: 1 },
  ), [monthly]);

  if (isLoading || !data) {
    return (
      <Card className="p-4">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-[200px] w-full mt-3" />
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Tickets raised</h3>
          <p className="text-[11px] text-muted-foreground">Per month, last 12 months</p>
        </div>
        <div className="flex items-start gap-4">
          <div className="text-right">
            <div className="text-base font-semibold leading-none">{data.raised_30d}</div>
            <div className="text-[10px] text-muted-foreground">last 30 days</div>
          </div>
          <div className="text-right">
            <div className="text-base font-semibold leading-none">{data.open}</div>
            <div className="text-[10px] text-muted-foreground">still open</div>
          </div>
          <Link to="/support-tickets" className="text-[10px] text-primary inline-flex items-center gap-0.5 hover:underline mt-1">
            Open <ExternalLink className="h-2.5 w-2.5" />
          </Link>
        </div>
      </div>

      <EChart option={option} height={200} />

      {data.overdue > 0 && (
        <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          {data.overdue} of {data.open} open tickets are past their due date
        </p>
      )}
    </Card>
  );
});
