import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";

export interface RevenueMonth {
  month: string;
  invoiced: number;
  received: number;
  google_spend: number;
}

export interface OrganicChannel {
  channel: string;
  posts: number;
  reach: number;
  engagement: number;
  followers: number;
  follower_change: number;
}

export interface DashboardOverview {
  revenue_months: RevenueMonth[];
  organic: OrganicChannel[];
  paid: {
    google: { spend: number; impressions: number; clicks: number; conversions: number };
    meta: {
      spend: number;
      attempted_budget: number;
      blocked: number;
      failed: number;
      live: number;
      last_attempt: string | null;
    };
  };
  tickets: {
    raised_30d: number;
    open: number;
    overdue: number;
    monthly: { month: string; raised: number }[] | null;
  };
}

export interface RecentLead {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  source: string | null;
  product: string | null;
  created_at: string;
}

/** One round trip for the five in-database panels. */
export function useDashboardOverview(months = 12) {
  const { effectiveOrgId } = useOrgContext();

  return useQuery({
    queryKey: ["dashboard-overview", effectiveOrgId, months],
    queryFn: async (): Promise<DashboardOverview> => {
      if (!effectiveOrgId) throw new Error("No organization context");
      const { data, error } = await supabase.rpc("get_dashboard_overview", {
        _org_id: effectiveOrgId,
        _months: months,
      });
      if (error) throw error;
      return data as unknown as DashboardOverview;
    },
    enabled: !!effectiveOrgId,
    staleTime: 60000,
  });
}

/**
 * Leads are not in this database — they land in globalcrm through
 * web-lead-intake, so the dashboard-leads function reads across for them.
 */
export function useRecentLeads() {
  const { effectiveOrgId } = useOrgContext();

  return useQuery({
    queryKey: ["dashboard-recent-leads", effectiveOrgId],
    queryFn: async (): Promise<RecentLead[]> => {
      const { data, error } = await supabase.functions.invoke("dashboard-leads", { body: {} });
      if (error) throw error;
      return (data?.leads || []) as RecentLead[];
    },
    enabled: !!effectiveOrgId,
    staleTime: 60000,
  });
}
