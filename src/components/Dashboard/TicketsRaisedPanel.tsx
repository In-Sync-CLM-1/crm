import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import type { DashboardOverview } from "@/hooks/useDashboardOverview";

/** Tickets raised per month, with what is still open and what has slipped. */
const BAR = "#2a78d6"; // categorical slot 1

export const TicketsRaisedPanel = memo(function TicketsRaisedPanel({
  data, isLoading,
}: { data?: DashboardOverview["tickets"]; isLoading?: boolean }) {
  if (isLoading || !data) {
    return (
      <Card className="p-4">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-[180px] w-full mt-3" />
      </Card>
    );
  }

  const monthly = data.monthly || [];

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Tickets raised</h3>
          <p className="text-[11px] text-muted-foreground">Per month, last 12 months</p>
        </div>
        <div className="flex items-start gap-3">
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

      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} className="text-muted-foreground" />
          <YAxis tick={{ fontSize: 9 }} width={28} tickLine={false} axisLine={false} allowDecimals={false} className="text-muted-foreground" />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
            contentStyle={{ fontSize: 11, borderRadius: 6 }}
            formatter={(v: any) => [`${v} raised`, "Tickets"]}
          />
          <Bar dataKey="raised" radius={[4, 4, 0, 0]} maxBarSize={22}>
            {monthly.map((m) => <Cell key={m.month} fill={BAR} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {data.overdue > 0 && (
        <p className="mt-2 text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          {data.overdue} of {data.open} open tickets are past their due date
        </p>
      )}
    </Card>
  );
});
