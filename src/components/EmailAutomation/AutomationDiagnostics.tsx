import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, CheckCircle2, Clock, Mail, Settings, Users } from "lucide-react";
import { format } from "date-fns";

export function AutomationDiagnostics() {
  const { effectiveOrgId } = useOrgContext();

  // Get system health checks
  const { data: diagnostics, isLoading } = useQuery({
    queryKey: ["automation_diagnostics", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return null;

      // Fetch various metrics
      const [rulesResult, executionsResult, templatesResult, businessHoursResult, suppressionResult] = await Promise.all([
        supabase
          .from("email_automation_rules")
          .select("id, name, is_active, total_triggered, total_sent, total_failed")
          .eq("org_id", effectiveOrgId),
        
        supabase
          .from("email_automation_executions")
          .select("status, created_at")
          .eq("org_id", effectiveOrgId)
          .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
        
        supabase
          .from("email_templates")
          .select("id, name, is_active")
          .eq("org_id", effectiveOrgId),
        
        supabase
          .from("org_business_hours")
          .select("*")
          .eq("org_id", effectiveOrgId),
        
        supabase
          .from("email_suppression_list")
          .select("id")
          .eq("org_id", effectiveOrgId)
      ]);

      const rules = rulesResult.data || [];
      const executions = executionsResult.data || [];
      const templates = templatesResult.data || [];
      const businessHours = businessHoursResult.data || [];
      const suppressionList = suppressionResult.data || [];

      // Calculate metrics
      const activeRules = rules.filter(r => r.is_active).length;
      const inactiveRules = rules.filter(r => !r.is_active).length;
      const rulesWithHighFailRate = rules.filter(r => {
        const total = r.total_sent + r.total_failed;
        return total > 10 && (r.total_failed / total) > 0.1;
      });

      const last24hStats = {
        pending: executions.filter(e => e.status === 'pending').length,
        sent: executions.filter(e => e.status === 'sent').length,
        failed: executions.filter(e => e.status === 'failed').length,
        scheduled: executions.filter(e => e.status === 'scheduled').length,
      };

      const activeTemplates = templates.filter(t => t.is_active).length;
      const inactiveTemplates = templates.filter(t => !t.is_active).length;

      const businessHoursConfigured = businessHours.length > 0;
      const suppressionListSize = suppressionList.length;

      return {
        rules: {
          total: rules.length,
          active: activeRules,
          inactive: inactiveRules,
          highFailRate: rulesWithHighFailRate,
        },
        executions: last24hStats,
        templates: {
          total: templates.length,
          active: activeTemplates,
          inactive: inactiveTemplates,
        },
        config: {
          businessHoursConfigured,
          suppressionListSize,
        },
      };
    },
    enabled: !!effectiveOrgId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>System Diagnostics</CardTitle>
          <CardDescription>Loading automation system health...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Clock className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!diagnostics) {
    return null;
  }

  const getHealthStatus = () => {
    const issues = [];
    
    if (diagnostics.rules.active === 0) {
      issues.push("No active automation rules");
    }
    if (diagnostics.rules.highFailRate.length > 0) {
      issues.push(`${diagnostics.rules.highFailRate.length} rules with high failure rate`);
    }
    if (diagnostics.executions.failed > diagnostics.executions.sent * 0.1) {
      issues.push("High failure rate in last 24 hours");
    }
    if (!diagnostics.config.businessHoursConfigured) {
      issues.push("Business hours not configured");
    }

    if (issues.length === 0) return { status: "healthy", label: "All Systems Operational", icon: CheckCircle2 };
    if (issues.length <= 2) return { status: "warning", label: "Minor Issues Detected", icon: AlertCircle };
    return { status: "error", label: "Critical Issues", icon: AlertCircle };
  };

  const health = getHealthStatus();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <health.icon className={`h-5 w-5 ${
              health.status === 'healthy' ? 'text-green-500' : 
              health.status === 'warning' ? 'text-yellow-500' : 
              'text-red-500'
            }`} />
            System Health: {health.label}
          </CardTitle>
          <CardDescription>
            Real-time monitoring of automation system components
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Automation Rules</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{diagnostics.rules.total}</div>
            <div className="flex gap-2 mt-2">
              <Badge variant="default">{diagnostics.rules.active} Active</Badge>
              <Badge variant="secondary">{diagnostics.rules.inactive} Inactive</Badge>
            </div>
            {diagnostics.rules.highFailRate.length > 0 && (
              <div className="mt-2 text-xs text-destructive">
                ⚠ {diagnostics.rules.highFailRate.length} rules with high failure rate
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last 24 Hours</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{diagnostics.executions.sent + diagnostics.executions.failed}</div>
            <div className="space-y-1 mt-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sent:</span>
                <span className="font-medium text-green-600">{diagnostics.executions.sent}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Failed:</span>
                <span className="font-medium text-red-600">{diagnostics.executions.failed}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pending:</span>
                <span className="font-medium">{diagnostics.executions.pending}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Scheduled:</span>
                <span className="font-medium">{diagnostics.executions.scheduled}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Email Templates</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{diagnostics.templates.total}</div>
            <div className="flex gap-2 mt-2">
              <Badge variant="default">{diagnostics.templates.active} Active</Badge>
              <Badge variant="secondary">{diagnostics.templates.inactive} Inactive</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Business Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {diagnostics.config.businessHoursConfigured ? (
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              ) : (
                <AlertCircle className="h-8 w-8 text-yellow-500" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {diagnostics.config.businessHoursConfigured 
                ? "Configured" 
                : "Not configured"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Suppression List</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{diagnostics.config.suppressionListSize}</div>
            <p className="text-xs text-muted-foreground mt-2">
              Suppressed email addresses
            </p>
          </CardContent>
        </Card>
      </div>

      {diagnostics.rules.highFailRate.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Rules Requiring Attention
            </CardTitle>
            <CardDescription>
              These rules have a high failure rate and should be reviewed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {diagnostics.rules.highFailRate.map((rule) => {
                  const total = rule.total_sent + rule.total_failed;
                  const failureRate = ((rule.total_failed / total) * 100).toFixed(1);
                  return (
                    <div key={rule.id} className="flex items-center justify-between p-2 border rounded">
                      <div>
                        <p className="font-medium">{rule.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {rule.total_failed} failures out of {total} attempts
                        </p>
                      </div>
                      <Badge variant="destructive">{failureRate}% fail rate</Badge>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
