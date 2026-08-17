import { memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";
import { EChart } from "@/components/Marketing/EChart";
import { gaugeChart, SLOT } from "@/components/Dashboard/chartStyle";
import type { DashboardOverview } from "@/hooks/useDashboardOverview";
import { formatCurrency } from "@/utils/currency";

/**
 * Paid outcome. Google gets a gauge — yesterday's spend against the daily
 * budget is a single figure against a ceiling, which is what a gauge is for —
 * plus the funnel figures beside it.
 *
 * Meta is NOT reported as ₹0. Verified 2026-08-17: a promotion is live in Ads
 * Center, but the only ad account the business owns has zero lifetime spend and
 * no ads, and the page-typed token cannot enumerate the account funding it. The
 * panel shows real numbers the moment mkt-meta-insights can reach that account.
 */
export const PaidCampaignsPanel = memo(function PaidCampaignsPanel({
  data, isLoading,
}: { data?: DashboardOverview["paid"]; isLoading?: boolean }) {
  const g = data?.google;
  const dailyBudget = Number(g?.daily_budget ?? 0);
  // 30-day spend against what 30 days at the daily budget would have cost —
  // shows pacing, not a meaningless percentage of one day.
  const budget30 = dailyBudget * 30;
  const gauge = useMemo(
    () => gaugeChart(Number(g?.spend ?? 0), budget30 || 1, {
      color: SLOT.orange,
      formatter: (v) => formatCurrency(v),
    }),
    [g?.spend, budget30],
  );

  if (isLoading || !data) {
    return <Card className="p-4"><Skeleton className="h-4 w-40" /><Skeleton className="h-[150px] w-full mt-3" /></Card>;
  }

  const m = data.meta;
  const att = data.meta_attempted;
  const metaReadable = m?.spend != null;
  const ctr = g?.impressions ? (g.clicks / g.impressions) * 100 : 0;
  const cpc = g?.clicks ? Number(g.spend) / g.clicks : 0;
  const stuck = (att?.blocked ?? 0) + (att?.failed ?? 0);

  return (
    <Card className="p-4">
      <div className="mb-2">
        <h3 className="text-sm font-semibold">Paid campaigns</h3>
        <p className="text-[11px] text-muted-foreground">
          Google and Meta, last 30 days{g?.last_synced ? ` · Google synced to ${g.last_synced}` : ""}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-2">
          <div className="text-[11px] font-medium mb-1">Google Ads</div>
          <EChart option={gauge} height={104} />
          <p className="text-[10px] text-muted-foreground text-center -mt-1">
            {dailyBudget > 0 ? `spent of ${formatCurrency(budget30)} available at ${formatCurrency(dailyBudget)}/day` : "no daily budget set"}
          </p>
          <div className="grid grid-cols-3 gap-1 mt-1.5 border-t border-border pt-1.5 text-center">
            <div>
              <div className="text-sm font-semibold">{g?.clicks ?? 0}</div>
              <div className="text-[9px] text-muted-foreground">clicks</div>
            </div>
            <div>
              <div className="text-sm font-semibold">{ctr.toFixed(1)}%</div>
              <div className="text-[9px] text-muted-foreground">CTR</div>
            </div>
            <div>
              <div className="text-sm font-semibold">{formatCurrency(cpc)}</div>
              <div className="text-[9px] text-muted-foreground">per click</div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border p-2">
          <div className="text-[11px] font-medium mb-1">Meta</div>
          {metaReadable ? (
            <>
              <div className="text-2xl font-semibold leading-tight">{formatCurrency(Number(m!.spend))}</div>
              <div className="text-[10px] text-muted-foreground">
                spent across {m!.accounts} ad account{m!.accounts === 1 ? "" : "s"}
                {m!.last_synced ? ` · to ${m!.last_synced}` : ""}
              </div>
              <div className="grid grid-cols-3 gap-1 mt-2 border-t border-border pt-1.5 text-center">
                <div>
                  <div className="text-sm font-semibold">{Number(m!.reach ?? 0).toLocaleString("en-IN")}</div>
                  <div className="text-[9px] text-muted-foreground">reach</div>
                </div>
                <div>
                  <div className="text-sm font-semibold">{Number(m!.clicks ?? 0).toLocaleString("en-IN")}</div>
                  <div className="text-[9px] text-muted-foreground">clicks</div>
                </div>
                <div>
                  <div className="text-sm font-semibold">{Number(m!.impressions ?? 0).toLocaleString("en-IN")}</div>
                  <div className="text-[9px] text-muted-foreground">impressions</div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-medium text-muted-foreground">Spend not readable</div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                A promotion is live in Ads Center, but it is funded by an ad account these
                credentials cannot see. The only account the business owns has ₹0 lifetime
                spend and no ads{stuck > 0 ? `, plus ${stuck} boost${stuck === 1 ? "" : "es"} that never ran` : ""}.
              </p>
              <p className="mt-1.5 text-[10px] text-amber-600 dark:text-amber-400 flex items-start gap-1">
                <AlertTriangle className="h-3 w-3 mt-px shrink-0" />
                Add that ad account to the In-Sync business (or send its act_ id) and this
                fills in on the next sync — no other change needed.
              </p>
            </>
          )}
        </div>
      </div>
    </Card>
  );
});
