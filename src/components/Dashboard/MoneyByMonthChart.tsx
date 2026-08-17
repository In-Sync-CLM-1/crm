import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from "recharts";
import type { RevenueMonth } from "@/hooks/useDashboardOverview";
import { formatCompactINR, formatCurrency } from "@/utils/currency";

/**
 * Twelve months of billing, on one axis because both series are rupees.
 * Replaces "Monthly Revenue by Client", which claimed six months but obeyed the
 * page's date filter, so a single invoice in the selected range rendered as one
 * floating dot.
 */

// Categorical slots 1 and 2 of the validated palette (blue / orange), stepped
// per mode. Identity is carried by the legend and the tooltip, never by colour
// alone.
const SERIES = {
  invoiced: { light: "#2a78d6", dark: "#3987e5", label: "Invoiced" },
  received: { light: "#eb6834", dark: "#d95926", label: "Received" },
};

interface Props {
  data: RevenueMonth[];
  isLoading?: boolean;
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-2 shadow-md">
      <p className="text-xs font-medium text-popover-foreground">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.fill }} />
          {p.name}: <span className="font-medium text-popover-foreground">{formatCurrency(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export const MoneyByMonthChart = memo(function MoneyByMonthChart({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <Card className="p-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-56 mt-1" />
        <Skeleton className="h-[220px] w-full mt-3" />
      </Card>
    );
  }

  const hasData = (data || []).some((d) => d.invoiced > 0 || d.received > 0);
  const total = (data || []).reduce((s, d) => s + (d.received || 0), 0);

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Revenue by month</h3>
          <p className="text-[10px] text-muted-foreground">
            Invoiced against cash actually received, last 12 months
          </p>
        </div>
        <div className="text-right">
          <div className="text-base font-semibold leading-none">{formatCompactINR(total)}</div>
          <div className="text-[10px] text-muted-foreground">received, 12 mo</div>
        </div>
      </div>

      {!hasData ? (
        <div className="h-[220px] flex items-center justify-center text-muted-foreground text-xs">
          No billing recorded yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} className="text-muted-foreground" />
            <YAxis
              tick={{ fontSize: 9 }} width={46} tickLine={false} axisLine={false}
              className="text-muted-foreground" tickFormatter={(v) => formatCompactINR(Number(v))}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
            <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} iconType="square" />
            <Bar dataKey="invoiced" name={SERIES.invoiced.label} radius={[4, 4, 0, 0]} maxBarSize={18}>
              {data.map((d) => <Cell key={d.month} fill={SERIES.invoiced.light} />)}
            </Bar>
            <Bar dataKey="received" name={SERIES.received.label} radius={[4, 4, 0, 0]} maxBarSize={18}>
              {data.map((d) => <Cell key={d.month} fill={SERIES.received.light} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
});
