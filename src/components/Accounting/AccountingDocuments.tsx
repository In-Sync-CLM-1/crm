import { ExternalLink, FileText, Paperclip, Upload, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAccountingData } from "@/hooks/useAccountingData";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { format } from "date-fns";
import type { JournalEntry } from "@/types/accounting";

interface BankStatement {
  id: string;
  filename: string | null;
  from_date: string | null;
  to_date: string | null;
  row_count: number;
  uploaded_at: string;
  statement_type: string;
}

export function AccountingDocuments() {
  const { effectiveOrgId } = useOrgContext();

  // Journal entries that have an invoice attached
  const { data: invoiceEntries = [], isLoading: invLoading } = useQuery<JournalEntry[]>({
    queryKey: ["invoice-entries", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("journal_entries")
        .select("id, entry_date, narration, invoice_url, invoice_party, invoice_date, invoice_description, invoice_amount")
        .eq("org_id", effectiveOrgId)
        .not("invoice_url", "is", null)
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as JournalEntry[];
    },
    enabled: !!effectiveOrgId,
  });

  // All bank statements
  const { data: statements = [], isLoading: stmtLoading } = useQuery<BankStatement[]>({
    queryKey: ["bank-statements-all", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("bank_statements")
        .select("id, filename, from_date, to_date, row_count, uploaded_at, statement_type")
        .eq("org_id", effectiveOrgId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BankStatement[];
    },
    enabled: !!effectiveOrgId,
  });

  return (
    <div className="space-y-6">

      {/* ── Invoices ── */}
      <Card>
        <CardHeader className="py-3 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-violet-500" />
            Uploaded Invoices
            <Badge variant="secondary" className="ml-1">{invoiceEntries.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {invLoading ? (
            <p className="text-sm text-muted-foreground p-4">Loading…</p>
          ) : invoiceEntries.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center text-muted-foreground">
              <Upload className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No invoices uploaded yet.</p>
              <p className="text-xs mt-1">Upload invoices from the Director's Expenses tab.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs">
                  <tr>
                    <th className="px-4 py-2 text-left">Party</th>
                    <th className="px-4 py-2 text-left">Invoice Date</th>
                    <th className="px-4 py-2 text-left">Description</th>
                    <th className="px-4 py-2 text-right">Amount (₹)</th>
                    <th className="px-4 py-2 text-left">Journal Narration</th>
                    <th className="px-4 py-2 text-left">Journal Date</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoiceEntries.map(e => (
                    <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2 font-medium">
                        {e.invoice_party ? (
                          <span className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {e.invoice_party}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs italic">Not parsed</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                        {e.invoice_date ?? <span className="italic text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2 max-w-xs">
                        <p className="truncate">{e.invoice_description ?? <span className="italic text-xs text-muted-foreground">—</span>}</p>
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        {e.invoice_amount != null
                          ? `₹${Number(e.invoice_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2 max-w-xs">
                        <p className="truncate text-muted-foreground text-xs">{e.narration}</p>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">
                        {format(new Date(e.entry_date), "dd MMM yyyy")}
                      </td>
                      <td className="px-2 py-2">
                        <a
                          href={e.invoice_url!}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open invoice"
                        >
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Bank Statements ── */}
      <Card>
        <CardHeader className="py-3 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-500" />
            Uploaded Bank Statements
            <Badge variant="secondary" className="ml-1">{statements.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {stmtLoading ? (
            <p className="text-sm text-muted-foreground p-4">Loading…</p>
          ) : statements.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No bank statements uploaded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs">
                  <tr>
                    <th className="px-4 py-2 text-left">File</th>
                    <th className="px-4 py-2 text-left">Type</th>
                    <th className="px-4 py-2 text-left">Period</th>
                    <th className="px-4 py-2 text-right">Rows</th>
                    <th className="px-4 py-2 text-left">Uploaded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {statements.map(s => (
                    <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2 font-medium max-w-xs">
                        <p className="truncate">{s.filename ?? "—"}</p>
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={s.statement_type === "director_personal" ? "secondary" : "outline"} className="text-xs">
                          {s.statement_type === "director_personal" ? "Personal (Amit)" : "Company"}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap text-xs">
                        {s.from_date && s.to_date
                          ? `${format(new Date(s.from_date), "dd MMM yyyy")} – ${format(new Date(s.to_date), "dd MMM yyyy")}`
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{s.row_count}</td>
                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap text-xs">
                        {format(new Date(s.uploaded_at), "dd MMM yyyy, HH:mm")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
