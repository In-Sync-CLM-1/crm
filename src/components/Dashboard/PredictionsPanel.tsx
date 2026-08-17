import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import type { DashboardOverview } from "@/hooks/useDashboardOverview";
import { forecast } from "@/utils/forecast";
import { formatCompactINR } from "@/utils/currency";

/**
 * Next month, projected from what actually happened.
 *
 * Each figure says what it is based on, because a number with no stated basis
 * invites more trust than a 12-point history deserves. Where there isn't
 * enough history the tile says so rather than showing a confident guess.
 */
interface Props {
  data?: DashboardOverview;
  isLoading?: boolean;
}

function Tile({
  label, value, sub, direction,
}: {
  label: string;
  value: string;
  sub: string;
  direction?: "up" | "down" | "flat";
}) {
  const Icon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;
  const tone = direction === "up"
    ? "text-emerald-600 dark:text-emerald-400"
    : direction === "down" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground";
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        {direction && <Icon className={`h-3.5 w-3.5 ${tone}`} />}
      </div>
      <div className="text-xl font-semibold leading-tight mt-1">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

function dir(next: number, last: number): "up" | "down" | "flat" {
  if (last === 0) return next > 0 ? "up" : "flat";
  const change = (next - last) / Math.abs(last);
  return change > 0.05 ? "up" : change < -0.05 ? "down" : "flat";
}

export const PredictionsPanel = memo(function PredictionsPanel({ data, isLoading }: Props) {
  if (isLoading || !data) {
    return (
      <Card className="p-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-[110px] w-full mt-3" />
      </Card>
    );
  }

  const months = data.revenue_months || [];
  const received = months.map((m) => m.received);
  const spend = months.map((m) => m.google_spend);
  const ticketSeries = (data.tickets?.monthly || []).map((m) => m.raised);

  const revenueF = forecast(received, 1);
  const spendF = forecast(spend, 1);
  const ticketF = forecast(ticketSeries, 1);

  // Followers project from the last 30 days' movement, not a fitted series —
  // there is only one snapshot cadence and a month of it.
  const linkedin = (data.organic || []).find((c) => c.channel === "linkedin");

  const lastReceived = received[received.length - 1] ?? 0;
  const lastSpend = spend[spend.length - 1] ?? 0;
  const lastTickets = ticketSeries[ticketSeries.length - 1] ?? 0;

  return (
    <Card className="p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Next month, projected</h3>
        <p className="text-[11px] text-muted-foreground">
          From the last 6 months, with the trend damped so one unusual month can't run away with it
        </p>
      </div>

      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Revenue"
          value={revenueF ? formatCompactINR(revenueF.points[0]) : "—"}
          sub={revenueF
            ? `range ${formatCompactINR(revenueF.low[0])}–${formatCompactINR(revenueF.high[0])}`
            : "not enough history"}
          direction={revenueF ? dir(revenueF.points[0], lastReceived) : undefined}
        />
        <Tile
          label="Ad spend"
          value={spendF ? formatCompactINR(spendF.points[0]) : "—"}
          sub={spendF ? "at the current run rate" : "not enough history"}
          direction={spendF ? dir(spendF.points[0], lastSpend) : undefined}
        />
        <Tile
          label="Tickets"
          value={ticketF ? String(Math.round(ticketF.points[0])) : "—"}
          sub={ticketF
            ? `range ${Math.round(ticketF.low[0])}–${Math.round(ticketF.high[0])}`
            : "not enough history"}
          direction={ticketF ? dir(ticketF.points[0], lastTickets) : undefined}
        />
        <Tile
          label="LinkedIn followers"
          value={linkedin ? (linkedin.followers + linkedin.follower_change).toLocaleString("en-IN") : "—"}
          sub={linkedin
            ? `${linkedin.follower_change >= 0 ? "+" : ""}${linkedin.follower_change} in the last 30 days`
            : "no snapshots yet"}
          direction={linkedin ? (linkedin.follower_change > 0 ? "up" : linkedin.follower_change < 0 ? "down" : "flat") : undefined}
        />
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground flex items-start gap-1">
        <Info className="h-3 w-3 mt-px shrink-0" />
        Projections, not commitments. Leads are left out on purpose — 5 enquiries in
        12 months is too little to forecast from, and a number there would be invented.
      </p>
    </Card>
  );
});
