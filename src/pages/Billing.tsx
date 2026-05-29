import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useNotification } from "@/hooks/useNotification";
import { CreditCard, Wallet, FileText, TrendingUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import DashboardLayout from "@/components/Layout/DashboardLayout";

export default function Billing() {
  const { effectiveOrgId, isPlatformAdmin, isLoading: orgLoading } = useOrgContext();
  const notify = useNotification();
  const navigate = useNavigate();
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Redirect non-platform admins
  useEffect(() => {
    if (!orgLoading && isPlatformAdmin === false) {
      notify.error("Access Denied", new Error("Only platform admins can access billing."));
      navigate("/dashboard");
    }
  }, [isPlatformAdmin, orgLoading, navigate]);

  // Fetch organization details
  const { data: org } = useQuery({
    queryKey: ["organization", effectiveOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", effectiveOrgId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId,
  });

  // Fetch subscription data
  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ["subscription", effectiveOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_subscriptions")
        .select("*")
        .eq("org_id", effectiveOrgId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId,
  });

  // Fetch invoices
  const { data: invoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ["invoices", effectiveOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_invoices")
        .select("*")
        .eq("org_id", effectiveOrgId)
        .order("invoice_date", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId,
  });

  // Fetch wallet transactions
  const { data: walletTransactions, isLoading: walletLoading } = useQuery({
    queryKey: ["wallet-transactions", effectiveOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_transactions")
        .select("*")
        .eq("org_id", effectiveOrgId)
        .order("created_at", { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId,
  });

  const handlePayInvoice = async (invoiceId: string, amount: number) => {
    try {
      setIsProcessingPayment(true);
      
      const { data, error } = await supabase.functions.invoke("create-razorpay-order", {
        body: {
          amount,
          invoice_id: invoiceId,
          transaction_type: "subscription_payment",
        },
      });

      if (error) throw error;

      // Initialize Razorpay
      const options = {
        key: data.razorpay_key_id,
        amount: data.order.amount,
        currency: data.order.currency,
        name: org?.name || "Organization",
        description: `Invoice Payment`,
        order_id: data.order.id,
        handler: async (response: any) => {
          const { error: verifyError } = await supabase.functions.invoke("verify-razorpay-payment", {
            body: {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              payment_transaction_id: data.payment_transaction_id,
            },
          });

          if (verifyError) {
        notify.error("Payment verification failed", verifyError);
          } else {
      notify.success("Payment successful", "Your invoice has been paid");
          }
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (error: any) {
      notify.error("Error", error);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleWalletTopup = async (amount: number) => {
    try {
      setIsProcessingPayment(true);
      
      const { data, error } = await supabase.functions.invoke("create-razorpay-order", {
        body: {
          amount,
          transaction_type: "wallet_topup",
        },
      });

      if (error) throw error;

      const options = {
        key: data.razorpay_key_id,
        amount: data.order.amount,
        currency: data.order.currency,
        name: org?.name || "Organization",
        description: "Wallet Top-up",
        order_id: data.order.id,
        handler: async (response: any) => {
          const { error: verifyError } = await supabase.functions.invoke("verify-razorpay-payment", {
            body: {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              payment_transaction_id: data.payment_transaction_id,
            },
          });

          if (verifyError) {
            notify.error("Payment verification failed", verifyError);
          } else {
            notify.success("Top-up successful", "Your wallet has been credited");
          }
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (error: any) {
      notify.error("Error", error);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: "default",
      suspended_grace: "secondary",
      suspended_readonly: "destructive",
      suspended_locked: "destructive",
      cancelled: "outline",
    };
    return <Badge variant={variants[status] || "default"}>{status.replace(/_/g, " ")}</Badge>;
  };

  if (subLoading) {
    return <div>Loading subscription details...</div>;
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Billing & Subscription</h1>
          <p className="text-muted-foreground">Manage your subscription and payments</p>
        </div>
        <Button onClick={() => handleWalletTopup(5000)} disabled={isProcessingPayment}>
          <Wallet className="mr-2 h-4 w-4" />
          Top Up Wallet
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Subscription Status</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2">
              {subscription && getStatusBadge(subscription.subscription_status)}
            </div>
            <p className="text-xs text-muted-foreground">
              Next billing: {subscription?.next_billing_date}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Wallet Balance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{subscription?.wallet_balance || 0}</div>
            <p className="text-xs text-muted-foreground">
              Min balance: ₹{subscription?.wallet_minimum_balance || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Amount</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₹{subscription?.monthly_subscription_amount || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {subscription?.user_count || 0} users
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="invoices" className="space-y-4">
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="wallet">Wallet History</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>Your billing history and pending payments</CardDescription>
            </CardHeader>
            <CardContent>
              {invoicesLoading ? (
                <div>Loading invoices...</div>
              ) : invoices && invoices.length > 0 ? (
                <div className="space-y-4">
                  {invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="space-y-1">
                        <p className="font-medium">{invoice.invoice_number}</p>
                        <p className="text-sm text-muted-foreground">
                          Period: {invoice.billing_period_start} to {invoice.billing_period_end}
                        </p>
                        <p className="text-sm">
                          <Badge
                            variant={
                              invoice.payment_status === "paid"
                                ? "default"
                                : invoice.payment_status === "overdue"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {invoice.payment_status}
                          </Badge>
                        </p>
                      </div>
                      <div className="text-right space-y-2">
                        <p className="text-2xl font-bold">₹{invoice.total_amount}</p>
                        {invoice.payment_status === "pending" ||
                        invoice.payment_status === "overdue" ? (
                          <Button
                            size="sm"
                            onClick={() => handlePayInvoice(invoice.id, invoice.total_amount)}
                            disabled={isProcessingPayment}
                          >
                            Pay Now
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No invoices found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wallet" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Wallet Transactions</CardTitle>
              <CardDescription>Recent wallet activity</CardDescription>
            </CardHeader>
            <CardContent>
              {walletLoading ? (
                <div>Loading transactions...</div>
              ) : walletTransactions && walletTransactions.length > 0 ? (
                <div className="space-y-4">
                  {walletTransactions.map((txn) => (
                    <div
                      key={txn.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="space-y-1">
                        <p className="font-medium capitalize">
                          {txn.transaction_type.replace(/_/g, " ")}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(txn.created_at), { addSuffix: true })}
                        </p>
                        {txn.description && (
                          <p className="text-sm text-muted-foreground">{txn.description}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-xl font-bold ${
                            txn.amount >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {txn.amount >= 0 ? "+" : ""}₹{Math.abs(txn.amount)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Balance: ₹{txn.balance_after}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No transactions found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </DashboardLayout>
  );
}
