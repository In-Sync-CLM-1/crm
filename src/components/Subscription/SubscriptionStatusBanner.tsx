import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, Clock, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function SubscriptionStatusBanner() {
  const { effectiveOrgId } = useOrgContext();
  const navigate = useNavigate();

  const { data: subscription } = useQuery({
    queryKey: ["subscription-status", effectiveOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_subscriptions")
        .select("subscription_status, grace_period_end, readonly_period_end, lockout_date, wallet_balance, wallet_minimum_balance")
        .eq("org_id", effectiveOrgId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId,
    refetchInterval: 60000, // Refetch every minute
  });

  if (!subscription || subscription.subscription_status === "active") {
    return null;
  }

  const getAlertConfig = () => {
    switch (subscription.subscription_status) {
      case "suspended_grace":
        return {
          variant: "default" as const,
          icon: Clock,
          title: "Payment Overdue - Grace Period",
          description: `Your payment is overdue. Please make payment before ${subscription.grace_period_end} to avoid service interruption.`,
        };
      case "suspended_readonly":
        return {
          variant: "destructive" as const,
          icon: AlertCircle,
          title: "Services Limited - Payment Required",
          description: `Your account is in read-only mode. Pay now to restore full access before ${subscription.readonly_period_end}.`,
        };
      case "suspended_locked":
        return {
          variant: "destructive" as const,
          icon: Lock,
          title: "Account Locked - Immediate Payment Required",
          description: "Your account is locked due to payment overdue. Make payment immediately to restore access.",
        };
      default:
        return null;
    }
  };

  const alertConfig = getAlertConfig();
  if (!alertConfig) return null;

  const Icon = alertConfig.icon;

  return (
    <div className="mx-6 mt-4">
      <Alert variant={alertConfig.variant}>
        <Icon className="h-4 w-4" />
        <AlertTitle>{alertConfig.title}</AlertTitle>
        <AlertDescription className="flex items-center justify-between">
          <span>{alertConfig.description}</span>
          <Button 
            onClick={() => navigate("/billing")}
            variant="outline"
            size="sm"
            className="ml-4"
          >
            Pay Now
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}