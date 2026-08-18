import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { LoadingState } from "@/components/common/LoadingState";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useDashboardOverview, useRecentLeads } from "@/hooks/useDashboardOverview";
import { PredictionsPanel } from "@/components/Dashboard/PredictionsPanel";
import { MoneyByMonthChart } from "@/components/Dashboard/MoneyByMonthChart";
import { OrganicChannelsPanel } from "@/components/Dashboard/OrganicChannelsPanel";
import { PaidCampaignsPanel } from "@/components/Dashboard/PaidCampaignsPanel";
import { BDOutreachPanel } from "@/components/Dashboard/BDOutreachPanel";
import { NewLeadsPanel } from "@/components/Dashboard/NewLeadsPanel";
import { CampaignSpendChart } from "@/components/Dashboard/CampaignSpendChart";
import { TicketsRaisedPanel } from "@/components/Dashboard/TicketsRaisedPanel";

/**
 * The dashboard — and the only one. Amit specified its contents exactly:
 * organic campaign outcome by channel, paid outcome on Google and Meta,
 * month-wise revenue, the newest leads with their source, campaign spend,
 * tickets raised, BD outreach, and next month's projections. Nothing else.
 *
 * The Revenue and GST views that used to hang off this page are gone with the
 * other dashboards, and the date filter went with them: every panel here is
 * either last-30-days or last-12-months by definition, so a date picker that
 * governed nothing was just another control to wonder about.
 *
 * One round trip fills it (get_dashboard_overview) plus one for leads, which
 * live in globalcrm rather than here.
 */
export default function Dashboard() {
  const { effectiveOrgId, isLoading: orgLoading } = useOrgContext();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: overview, isLoading: overviewLoading } = useDashboardOverview(12);
  const { data: recentLeads, isLoading: leadsLoading } = useRecentLeads();

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-recent-leads"] }),
    ]);
    setRefreshing(false);
  };

  if (!effectiveOrgId || orgLoading) {
    return (
      <DashboardLayout>
        <LoadingState message="Loading dashboard data..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">In-Sync CRM · Overview</p>
            <h1 className="font-display text-[1.75rem] font-medium tracking-tight mt-0.5">Dashboard</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              What the business and the engine actually did — and what next month looks like
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Projections first — the numbers worth acting on before the detail. */}
        <PredictionsPanel data={overview} isLoading={overviewLoading} />

        {/* Money */}
        <MoneyByMonthChart data={overview?.revenue_months || []} isLoading={overviewLoading} />

        {/* Campaigns — organic beside paid */}
        <div className="grid gap-3 lg:grid-cols-2">
          <OrganicChannelsPanel data={overview?.organic} isLoading={overviewLoading} />
          <PaidCampaignsPanel data={overview?.paid} isLoading={overviewLoading} />
        </div>

        {/* Where the next business comes from */}
        <div className="grid gap-3 lg:grid-cols-2">
          <BDOutreachPanel data={overview?.bd} isLoading={overviewLoading} />
          <NewLeadsPanel data={recentLeads} isLoading={leadsLoading} />
        </div>

        {/* Cost and load */}
        <div className="grid gap-3 lg:grid-cols-2">
          <CampaignSpendChart data={overview?.revenue_months} isLoading={overviewLoading} />
          <TicketsRaisedPanel data={overview?.tickets} isLoading={overviewLoading} />
        </div>
      </div>
    </DashboardLayout>
  );
}
