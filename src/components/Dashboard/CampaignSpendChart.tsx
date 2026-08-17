import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import type { RevenueMonth } from "@/hooks/useDashboardOverview";
import { formatCompactINR, formatCurrency } from "@/utils/currency";

/**
 * Ad spend per month. Google only, because Meta has never actually spent —
 * a stacked "Meta" series would be a row of zeros pretending to be a channel.
 */
const BAR = "#eb6834"; // categorical slot 2

export const CampaignSpendChart = memo(function CampaignSpendChart({
  data, isLoading,
}: { data?: RevenueMonth[]; isLoading?: boolean }) {
  if (isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-[180px] w-full mt-3" />
      </Card>
    );
  }

  const rows = data || [];
  const total = rows.reduce((s, r) => s + (r.google_spend || 0), 0);
  const hasSpend = total > 0;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Campaign spend</h3>
          <p className="text-[11px] text-muted-foreground">Google Ads billing per month</p>
        </div>
        <div className="text-right">
          <div className="text-base font-semibold leading-none">{formatCompactINR(total)}</div>
          <div className="text-[10px] text-muted-foreground">12 months</div>
        </div>
      </div>

      {!hasSpend ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">
          No ad spend recorded
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} className="text-muted-foreground" />
            <YAxis
              tick={{ fontSize: 9 }} width={44} tickLine={false} axisLine={false}
              className="text-muted-foreground" tickFormatter={(v) => formatCompactINR(Number(v))}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
              contentStyle={{ fontSize: 11, borderRadius: 6 }}
              formatter={(v: any) => [formatCurrency(Number(v)), "Google Ads"]}
            />
            <Bar dataKey="google_spend" radius={[4, 4, 0, 0]} maxBarSize={22}>
              {rows.map((r) => <Cell key={r.month} fill={BAR} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
});
