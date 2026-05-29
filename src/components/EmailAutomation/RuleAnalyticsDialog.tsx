import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ExecutionHistoryTable } from "./ExecutionHistoryTable";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { format, subDays } from "date-fns";
import { TrendingUp, Mail, Clock, Users } from "lucide-react";

interface RuleAnalyticsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ruleId: string;
  ruleName: string;
}

const COLORS = ["hsl(var(--chart-2))", "hsl(var(--destructive))", "hsl(var(--muted))"];

export function RuleAnalyticsDialog({
  open,
  onOpenChange,
  ruleId,
  ruleName,
}: RuleAnalyticsDialogProps) {
  const { data: ruleStats, isLoading } = useQuery({
    queryKey: ["rule_analytics", ruleId],
    queryFn: async () => {
      const { data: rule, error: ruleError } = await supabase
        .from("email_automation_rules")
        .select("*")
        .eq("id", ruleId)
        .single();

      if (ruleError) throw ruleError;

      const { data: executions, error: execError } = await supabase
        .from("email_automation_executions")
        .select("created_at, status, sent_at")
        .eq("rule_id", ruleId)
        .gte("created_at", subDays(new Date(), 30).toISOString());

      if (execError) throw execError;

      // Calculate metrics
      const totalTriggered = executions.length;
      const sent = executions.filter((e) => e.status === "sent").length;
      const failed = executions.filter((e) => e.status === "failed").length;
      const pending = executions.filter((e) => e.status === "pending").length;
      const successRate = totalTriggered > 0 ? ((sent / totalTriggered) * 100).toFixed(1) : "0";

      // Calculate average send time
      const sentExecutions = executions.filter((e) => e.sent_at && e.created_at);
      const avgSendTime = sentExecutions.length > 0
        ? sentExecutions.reduce((sum, e) => {
            const diff = new Date(e.sent_at!).getTime() - new Date(e.created_at).getTime();
            return sum + diff;
          }, 0) / sentExecutions.length / 1000 / 60 // Convert to minutes
        : 0;

      // Group by day for trend
      const dailyStats: Record<string, { date: string; triggered: number; sent: number; failed: number }> = {};
      executions.forEach((exec) => {
        const date = format(new Date(exec.created_at), "MMM dd");
        if (!dailyStats[date]) {
          dailyStats[date] = { date, triggered: 0, sent: 0, failed: 0 };
        }
        dailyStats[date].triggered++;
        if (exec.status === "sent") dailyStats[date].sent++;
        if (exec.status === "failed") dailyStats[date].failed++;
      });

      const trendData = Object.values(dailyStats).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      const statusData = [
        { name: "Sent", value: sent },
        { name: "Failed", value: failed },
        { name: "Pending", value: pending },
      ].filter((item) => item.value > 0);

      return {
        rule,
        totalTriggered,
        sent,
        failed,
        pending,
        successRate,
        avgSendTime: avgSendTime.toFixed(1),
        trendData,
        statusData,
      };
    },
    enabled: open && !!ruleId,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rule Analytics: {ruleName}</DialogTitle>
          <DialogDescription>
            Detailed performance metrics and execution history for this automation rule
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-[100px] w-full" />
            <Skeleton className="h-[300px] w-full" />
          </div>
        ) : (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="trends">Trends</TabsTrigger>
              <TabsTrigger value="executions">Executions</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Triggered</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{ruleStats?.totalTriggered}</div>
                    <p className="text-xs text-muted-foreground">Last 30 days</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{ruleStats?.successRate}%</div>
                    <p className="text-xs text-muted-foreground">
                      {ruleStats?.sent} sent / {ruleStats?.failed} failed
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Avg Send Time</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{ruleStats?.avgSendTime}</div>
                    <p className="text-xs text-muted-foreground">minutes after trigger</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Pending</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{ruleStats?.pending}</div>
                    <p className="text-xs text-muted-foreground">awaiting send</p>
                  </CardContent>
                </Card>
              </div>

              {/* Status Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Status Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  {ruleStats?.statusData && ruleStats.statusData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={ruleStats.statusData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {ruleStats.statusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      No status data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="trends" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Daily Performance Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  {ruleStats?.trendData && ruleStats.trendData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={ruleStats.trendData}>
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
                        <Bar dataKey="triggered" fill="hsl(var(--primary))" name="Triggered" />
                        <Bar dataKey="sent" fill="hsl(var(--chart-2))" name="Sent" />
                        <Bar dataKey="failed" fill="hsl(var(--destructive))" name="Failed" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                      No trend data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="executions">
              <ExecutionHistoryTable ruleId={ruleId} limit={100} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
