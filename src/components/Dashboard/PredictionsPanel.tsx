import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Info } from "lucide-react";
import type { DashboardOverview } from "@/hooks/useDashboardOverview";
import { forecast, completedPeriods } from "@/utils/forecast";
import { formatCompactINR } from "@/utils/currency";
import { StatTile } from "@/components/Dashboard/StatTile";

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
  const tone = direction === "up" ? "good" : direction === "down" ? "critical" : "default";
  return <StatTile label={label} value={value} hint={sub} tone={tone} />;
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

  // Fit completed months only — the current month is part-way through, and
  // including it makes every trend look like a collapse.
  const revenueF = forecast(completedPeriods(received), 1);
  const spendF = forecast(completedPeriods(spend), 1);
  const ticketF = forecast(completedPeriods(ticketSeries), 1);

  // Followers project from the last 30 days' movement, not a fitted series —
  // there is only one snapshot cadence and a month of it.
  const linkedin = (data.organic || []).find((c) => c.channel === "linkedin");

  const lastComplete = <T,>(a: T[]) => a[a.length - 2] ?? a[a.length - 1];
  const lastReceived = lastComplete(received) ?? 0;
  const lastSpend = lastComplete(spend) ?? 0;
  const lastTickets = lastComplete(ticketSeries) ?? 0;

  return (
    <Card className="p-4">
      <div className="mb-3">
        <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">Next month, projected</h3>
        <p className="text-[11px] text-muted-foreground">
          From the last 6 completed months, with the trend damped so one unusual month can't run away with it
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
