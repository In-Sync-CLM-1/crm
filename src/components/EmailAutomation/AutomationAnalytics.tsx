import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from "recharts";
import { format, subDays, startOfDay } from "date-fns";
import { Activity, Mail, TrendingUp, AlertCircle, Target } from "lucide-react";

interface AutomationAnalyticsProps {
  dateRange?: number; // days
}

export function AutomationAnalytics({ dateRange = 30 }: AutomationAnalyticsProps) {
  const { effectiveOrgId } = useOrgContext();

  const { data: trendData, isLoading: trendLoading } = useQuery({
    queryKey: ["automation_trend", effectiveOrgId, dateRange],
    queryFn: async () => {
      if (!effectiveOrgId) return [];

      const startDate = startOfDay(subDays(new Date(), dateRange));

      const { data, error } = await supabase
        .from("email_automation_executions")
        .select("created_at, status, sent_at, converted_at")
        .eq("org_id", effectiveOrgId)
        .gte("created_at", startDate.toISOString());

      if (error) throw error;

      // Group by day
      const dailyStats: Record<string, { date: string; triggered: number; sent: number; failed: number; converted: number }> = {};

      data.forEach((exec) => {
        const date = format(new Date(exec.created_at), "MMM dd");
        if (!dailyStats[date]) {
          dailyStats[date] = { date, triggered: 0, sent: 0, failed: 0, converted: 0 };
        }
        dailyStats[date].triggered++;
        if (exec.status === "sent") dailyStats[date].sent++;
        if (exec.status === "failed") dailyStats[date].failed++;
        if (exec.converted_at) dailyStats[date].converted++;
      });

      return Object.values(dailyStats).sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
    },
    enabled: !!effectiveOrgId,
  });

  const { data: rulePerformance, isLoading: ruleLoading } = useQuery({
    queryKey: ["rule_performance", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];

      // Fetch rules with execution counts
      const { data: executions, error } = await supabase
        .from("email_automation_executions")
        .select("rule_id, status, converted_at, email_automation_rules(name)")
        .eq("org_id", effectiveOrgId);

      if (error) throw error;

      // Group by rule
      const ruleStats: Record<string, { 
        name: string; 
        triggered: number; 
        sent: number; 
        failed: number;
        converted: number;
      }> = {};

      executions.forEach((exec: any) => {
        const ruleName = exec.email_automation_rules?.name || 'Unknown';
        if (!ruleStats[exec.rule_id]) {
          ruleStats[exec.rule_id] = { name: ruleName, triggered: 0, sent: 0, failed: 0, converted: 0 };
        }
        ruleStats[exec.rule_id].triggered++;
        if (exec.status === "sent") ruleStats[exec.rule_id].sent++;
        if (exec.status === "failed") ruleStats[exec.rule_id].failed++;
        if (exec.converted_at) ruleStats[exec.rule_id].converted++;
      });

      return Object.values(ruleStats)
        .sort((a, b) => b.sent - a.sent)
        .slice(0, 10)
        .map((rule) => ({
          name: rule.name.substring(0, 20) + (rule.name.length > 20 ? "..." : ""),
          fullName: rule.name,
          triggered: rule.triggered,
          sent: rule.sent,
          failed: rule.failed,
          converted: rule.converted,
          successRate: rule.triggered > 0 
            ? Math.round((rule.sent / rule.triggered) * 100) 
            : 0,
          conversionRate: rule.sent > 0
            ? Math.round((rule.converted / rule.sent) * 100)
            : 0,
        }));
    },
    enabled: !!effectiveOrgId,
  });

  const { data: triggerStats, isLoading: triggerLoading } = useQuery({
    queryKey: ["trigger_stats", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];

      const { data, error } = await supabase
        .from("email_automation_executions")
        .select("trigger_type, status, converted_at")
        .eq("org_id", effectiveOrgId);

      if (error) throw error;

      const stats: Record<string, { trigger: string; count: number; sent: number; converted: number }> = {};

      data.forEach((exec) => {
        if (!stats[exec.trigger_type]) {
          stats[exec.trigger_type] = { trigger: exec.trigger_type, count: 0, sent: 0, converted: 0 };
        }
        stats[exec.trigger_type].count++;
        if (exec.status === "sent") stats[exec.trigger_type].sent++;
        if (exec.converted_at) stats[exec.trigger_type].converted++;
      });

      return Object.values(stats).map((stat) => ({
        ...stat,
        trigger: stat.trigger.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        conversionRate: stat.sent > 0 ? Math.round((stat.converted / stat.sent) * 100) : 0,
      }));
    },
    enabled: !!effectiveOrgId,
  });

  if (trendLoading || ruleLoading || triggerLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[300px] w-full" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Automation Trend (Last {dateRange} Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!trendData || trendData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No trend data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="triggered"
                  stroke="hsl(var(--primary))"
                  name="Triggered"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="sent"
                  stroke="hsl(var(--chart-2))"
                  name="Sent"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="failed"
                  stroke="hsl(var(--destructive))"
                  name="Failed"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="converted"
                  stroke="hsl(var(--chart-4))"
                  name="Converted"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Rule Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top Performing Rules
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!rulePerformance || rulePerformance.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No rule performance data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={rulePerformance}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="sent" fill="hsl(var(--chart-2))" name="Sent" />
                  <Bar dataKey="converted" fill="hsl(var(--chart-4))" name="Converted" />
                  <Bar dataKey="failed" fill="hsl(var(--destructive))" name="Failed" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Trigger Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Conversion by Trigger Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!triggerStats || triggerStats.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No trigger data available
              </div>
            ) : (
              <div className="space-y-4">
                {triggerStats.map((stat: any) => (
                  <div key={stat.trigger} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">{stat.trigger}</span>
                      <Badge variant="secondary">{stat.conversionRate}% converted</Badge>
                    </div>
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <span>{stat.sent} sent</span>
                      <span>•</span>
                      <span>{stat.converted} converted</span>
                      <span>•</span>
                      <span>{stat.count} triggered</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
