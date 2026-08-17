import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";
import type { DashboardOverview } from "@/hooks/useDashboardOverview";
import { formatCurrency } from "@/utils/currency";

/**
 * Paid outcome, last 30 days. Meta is reported as attempted rather than spent:
 * every boost so far came back blocked or failed, so showing its budget as
 * spend would invent money that never left the account.
 */
function Figure({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <div className={`text-lg font-semibold leading-tight ${muted ? "text-muted-foreground" : ""}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

export const PaidCampaignsPanel = memo(function PaidCampaignsPanel({
  data, isLoading,
}: { data?: DashboardOverview["paid"]; isLoading?: boolean }) {
  if (isLoading || !data) {
    return (
      <Card className="p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-[120px] w-full mt-3" />
      </Card>
    );
  }

  const g = data.google || { spend: 0, impressions: 0, clicks: 0, conversions: 0 };
  const m = data.meta || { spend: 0, attempted_budget: 0, blocked: 0, failed: 0, live: 0, last_attempt: null };
  const ctr = g.impressions ? (g.clicks / g.impressions) * 100 : 0;
  const cpc = g.clicks ? g.spend / g.clicks : 0;
  const metaStuck = (m.blocked || 0) + (m.failed || 0);

  return (
    <Card className="p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Paid campaigns</h3>
        <p className="text-[11px] text-muted-foreground">Google and Meta, last 30 days</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-3">
          <div className="text-[11px] font-medium mb-2">Google Ads</div>
          <div className="grid grid-cols-2 gap-y-2.5">
            <Figure label="Spend" value={formatCurrency(g.spend)} />
            <Figure label="Clicks" value={String(g.clicks)} />
            <Figure label="Impressions" value={g.impressions.toLocaleString("en-IN")} />
            <Figure label="Click-through" value={`${ctr.toFixed(1)}%`} />
            <Figure label="Cost per click" value={formatCurrency(cpc)} />
            <Figure label="Conversions" value={String(Math.round(g.conversions))} muted={!g.conversions} />
          </div>
        </div>

        <div className="rounded-lg border border-border p-3">
          <div className="text-[11px] font-medium mb-2">Meta</div>
          <div className="grid grid-cols-2 gap-y-2.5">
            <Figure label="Spend" value={formatCurrency(m.spend)} muted={!m.spend} />
            <Figure label="Live campaigns" value={String(m.live || 0)} muted={!m.live} />
            <Figure label="Budget attempted" value={formatCurrency(m.attempted_budget)} muted />
            <Figure label="Blocked / failed" value={String(metaStuck)} muted={!metaStuck} />
          </div>
          {metaStuck > 0 && (
            <p className="mt-2 text-[10px] text-amber-600 dark:text-amber-400 flex items-start gap-1">
              <AlertTriangle className="h-3 w-3 mt-px shrink-0" />
              Nothing has ever spent on Meta — {m.blocked} boost{m.blocked === 1 ? "" : "s"} blocked
              and {m.failed} failed{m.last_attempt ? `, last tried ${m.last_attempt}` : ""}.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
});
