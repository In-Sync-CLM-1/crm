import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useNotification } from "@/hooks/useNotification";
import { Mail, MessageSquare, Phone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import DashboardLayout from "@/components/Layout/DashboardLayout";

export default function Usage() {
  const { effectiveOrgId, isPlatformAdmin, isLoading: orgLoading } = useOrgContext();
  const notify = useNotification();
  const navigate = useNavigate();

  // Redirect non-platform admins
  useEffect(() => {
    if (!orgLoading && isPlatformAdmin === false) {
      notify.error("Access Denied", "Only platform admins can access usage analytics.");
      navigate("/dashboard");
    }
  }, [isPlatformAdmin, orgLoading, navigate, notify]);

  // Fetch usage logs
  const { data: usageLogs, isLoading } = useQuery({
    queryKey: ["usage-logs", effectiveOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_usage_logs")
        .select("*")
        .eq("org_id", effectiveOrgId)
        .order("created_at", { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId,
  });

  // Fetch user profiles for logs
  const { data: profiles } = useQuery({
    queryKey: ["profiles", effectiveOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("org_id", effectiveOrgId);
      
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId,
  });

  // Calculate totals
  const totals = usageLogs?.reduce(
    (acc, log) => {
      acc[log.service_type] = (acc[log.service_type] || 0) + Number(log.quantity);
      acc[`${log.service_type}_cost`] = (acc[`${log.service_type}_cost`] || 0) + Number(log.cost);
      return acc;
    },
    {} as Record<string, number>
  );

  const getServiceIcon = (type: string) => {
    switch (type) {
      case "email":
        return <Mail className="h-4 w-4" />;
      case "whatsapp":
        return <MessageSquare className="h-4 w-4" />;
      case "call":
        return <Phone className="h-4 w-4" />;
      default:
        return null;
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Usage Analytics</h1>
        <p className="text-muted-foreground">Track your service consumption</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Emails Sent</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals?.email || 0}</div>
            <p className="text-xs text-muted-foreground">
              Cost: ₹{totals?.email_cost || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">WhatsApp Messages</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals?.whatsapp || 0}</div>
            <p className="text-xs text-muted-foreground">
              Cost: ₹{totals?.whatsapp_cost || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Calls Made</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals?.call || 0}</div>
            <p className="text-xs text-muted-foreground">
              Cost: ₹{totals?.call_cost || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usage History</CardTitle>
          <CardDescription>Detailed breakdown of service usage</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div>Loading usage data...</div>
          ) : usageLogs && usageLogs.length > 0 ? (
            <div className="space-y-4">
              {usageLogs.map((log) => {
                const user = profiles?.find((p) => p.id === log.user_id);
                return (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center space-x-4">
                      {getServiceIcon(log.service_type)}
                      <div className="space-y-1">
                        <p className="font-medium capitalize">
                          {log.service_type}
                        </p>
                        {user && (
                          <p className="text-sm text-muted-foreground">
                            {user.first_name} {user.last_name || ""}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  <div className="text-right">
                    <p className="font-medium">
                      {log.quantity} {log.service_type === "call" ? "min" : "unit"}
                      {log.quantity > 1 ? "s" : ""}
                    </p>
                    <p className="text-sm text-muted-foreground">₹{log.cost}</p>
                    {!log.wallet_deducted && log.deduction_error && (
                      <p className="text-xs text-red-600">Failed: {log.deduction_error}</p>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground">No usage data found</p>
          )}
        </CardContent>
      </Card>
      </div>
    </DashboardLayout>
  );
}
