import { useState } from "react";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DateRangeFilter from "../Analytics/DateRangeFilter";
import AgentMetricsCards from "./AgentMetricsCards";
import AgentCallsChart from "./AgentCallsChart";
import AgentDispositionTable from "./AgentDispositionTable";

export default function AgentPerformanceTab() {
  const { effectiveOrgId } = useOrgContext();
  const [dateRange, setDateRange] = useState({ 
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 
    to: new Date() 
  });

  const { data: agentPerformance = [], isLoading } = useQuery({
    queryKey: ['agent-call-performance', effectiveOrgId, dateRange],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      
      const { data, error } = await supabase.rpc('get_agent_call_performance_report' as any, {
        p_org_id: effectiveOrgId,
        p_start_date: dateRange.from.toISOString(),
        p_end_date: dateRange.to.toISOString(),
      });

      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!effectiveOrgId,
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Agent Performance</h2>
          <p className="text-muted-foreground">Track individual agent call metrics and performance</p>
        </div>
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      <AgentMetricsCards data={agentPerformance} isLoading={isLoading} />
      <AgentCallsChart data={agentPerformance} isLoading={isLoading} />
      <AgentDispositionTable data={agentPerformance} isLoading={isLoading} />
    </div>
  );
}
