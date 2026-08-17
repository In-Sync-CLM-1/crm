import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";
import type { DashboardOverview } from "@/hooks/useDashboardOverview";
import { formatCurrency } from "@/utils/currency";

/**
 * Paid outcome, last 30 days.
 *
 * Google is read from the synced keyword metrics, which land a day behind —
 * the sync pulls yesterday, so "today" is never in here.
 *
 * Meta is deliberately NOT reported as zero. There IS a live promotion (Ads
 * Center, page-follows objective) that Meta's own UI shows spending, but it
 * runs on an ad account our page token cannot read: the business owns exactly
 * one ad account, act_1503032350759926, and through the API that account has
 * no spend and two campaigns from 7 Aug with no ads attached. Printing ₹0
 * would state something false, so the panel says the figure is unavailable and
 * why.
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
          <div className="text-sm font-medium text-muted-foreground">Spend not readable</div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            A promotion is live in Ads Center, but it runs on an ad account these
            credentials can't see. The one account the business owns
            (act_…759926) reports no spend and {metaStuck} campaign{metaStuck === 1 ? "" : "s"} with
            no ads attached{m.last_attempt ? `, last touched ${m.last_attempt}` : ""}.
          </p>
          <p className="mt-1.5 text-[10px] text-amber-600 dark:text-amber-400 flex items-start gap-1">
            <AlertTriangle className="h-3 w-3 mt-px shrink-0" />
            Give the Meta app access to that ad account and this fills in by itself.
          </p>
        </div>
      </div>
    </Card>
  );
});
