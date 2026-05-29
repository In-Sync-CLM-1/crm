import { useOrgContext } from "@/hooks/useOrgContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthlyTaxSummary } from "@/components/Clients/MonthlyTaxSummary";
import { Calculator, TrendingUp, TrendingDown, IndianRupee } from "lucide-react";
import { LoadingState } from "@/components/common/LoadingState";

export function TaxesTab() {
  const { effectiveOrgId } = useOrgContext();

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["client-invoices-taxes", effectiveOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_invoices")
        .select("*")
        .eq("org_id", effectiveOrgId!)
        .eq("document_type", "invoice")
        .order("invoice_date", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId,
  });

  // Calculate tax totals
  const totals = invoices?.reduce(
    (acc, inv) => {
      acc.totalGST += inv.tax_amount || 0;
      acc.totalTDS += inv.tds_amount || 0;
      acc.totalBase += inv.amount || 0;
      acc.totalNet += inv.net_received_amount || 0;
      return acc;
    },
    { totalGST: 0, totalTDS: 0, totalBase: 0, totalNet: 0 }
  ) || { totalGST: 0, totalTDS: 0, totalBase: 0, totalNet: 0 };

  if (isLoading) {
    return <LoadingState message="Loading tax data..." />;
  }

  return (
    <div className="space-y-6">
      {/* Tax Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Base Amount</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₹{totals.totalBase.toLocaleString("en-IN")}
            </div>
            <p className="text-xs text-muted-foreground">
              Before taxes across all invoices
            </p>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-700 dark:text-green-400">
              Total GST Collected
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700 dark:text-green-400">
              ₹{totals.totalGST.toLocaleString("en-IN")}
            </div>
            <p className="text-xs text-green-600/80">
              GST collected from clients
            </p>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-orange-50/50 dark:bg-orange-950/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-400">
              Total TDS Deducted
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">
              ₹{totals.totalTDS.toLocaleString("en-IN")}
            </div>
            <p className="text-xs text-orange-600/80">
              TDS deducted by clients
            </p>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Received</CardTitle>
            <Calculator className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              ₹{totals.totalNet.toLocaleString("en-IN")}
            </div>
            <p className="text-xs text-muted-foreground">
              Base + GST - TDS
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Tax Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Monthly Tax Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invoices && invoices.length > 0 ? (
            <MonthlyTaxSummary invoices={invoices as any} currency="INR" />
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No invoices found. Create invoices to see tax breakdown.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
