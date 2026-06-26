import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { format, differenceInDays } from "date-fns";

interface OutstandingDoc {
  id: string;
  doc_number: string;
  doc_date: string;
  due_date: string | null;
  client_name: string;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  status: string;
}

type AgeBucket = "current" | "1_30" | "31_60" | "61_90" | "90_plus";

interface AgedRow extends OutstandingDoc {
  days_overdue: number;
  bucket: AgeBucket;
}

const BUCKET_LABEL: Record<AgeBucket, string> = {
  current: "Current (not yet due)",
  "1_30": "1–30 days",
  "31_60": "31–60 days",
  "61_90": "61–90 days",
  "90_plus": "90+ days",
};

const BUCKET_COLOR: Record<AgeBucket, string> = {
  current: "bg-green-100 text-green-700 border-green-200",
  "1_30": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "31_60": "bg-orange-100 text-orange-700 border-orange-200",
  "61_90": "bg-red-100 text-red-700 border-red-200",
  "90_plus": "bg-red-200 text-red-800 border-red-300",
};

function fmt(n: number) {
  if (n === 0) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function getBucket(daysOverdue: number): AgeBucket {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30)  return "1_30";
  if (daysOverdue <= 60)  return "31_60";
  if (daysOverdue <= 90)  return "61_90";
  return "90_plus";
}

function exportCsv(rows: AgedRow[]) {
  const header = ["Client", "Invoice#", "Invoice Date", "Due Date", "Invoice Amount", "Amount Paid", "Balance Due", "Days Overdue", "Age Bucket"];
  const lines = rows.map(r => [
    r.client_name, r.doc_number,
    format(new Date(r.doc_date), "dd/MM/yyyy"),
    r.due_date ? format(new Date(r.due_date), "dd/MM/yyyy") : "—",
    r.total_amount.toFixed(2), r.amount_paid.toFixed(2), r.balance_due.toFixed(2),
    String(Math.max(0, r.days_overdue)), BUCKET_LABEL[r.bucket],
  ]);
  const csv = [header, ...lines].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = `Outstanding_${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

export function AccountingOutstanding() {
  const { effectiveOrgId } = useOrgContext();
  const [docs, setDocs] = useState<OutstandingDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const today = new Date();

  useEffect(() => {
    if (!effectiveOrgId) return;
    setLoading(true);
    supabase
      .from("billing_documents")
      .select("id, doc_number, doc_date, due_date, client_name, total_amount, amount_paid, balance_due, status")
      .eq("org_id", effectiveOrgId)
      .eq("doc_type", "invoice")
      .gt("balance_due", 0)
      .order("doc_date")
      .then(({ data }) => {
        setDocs((data ?? []) as OutstandingDoc[]);
        setLoading(false);
      });
  }, [effectiveOrgId]);

  const agedRows: AgedRow[] = useMemo(() => {
    return docs.map(d => {
      const referenceDate = d.due_date ? new Date(d.due_date) : new Date(d.doc_date);
      const daysOverdue = differenceInDays(today, referenceDate);
      return { ...d, days_overdue: daysOverdue, bucket: getBucket(daysOverdue) };
    });
  }, [docs, today]);

  // Group by client
  const byClient = useMemo(() => {
    const map = new Map<string, AgedRow[]>();
    for (const r of agedRows) {
      if (!map.has(r.client_name)) map.set(r.client_name, []);
      map.get(r.client_name)!.push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [agedRows]);

  // Bucket totals
  const bucketTotals = useMemo(() => {
    const t: Record<AgeBucket, number> = { current: 0, "1_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0 };
    for (const r of agedRows) t[r.bucket] += r.balance_due;
    return t;
  }, [agedRows]);

  const grandTotal = agedRows.reduce((s, r) => s + r.balance_due, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          As at {format(today, "dd MMMM yyyy")} — invoices with outstanding balance
        </p>
        {agedRows.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => exportCsv(agedRows)}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
        )}
      </div>

      {/* Ageing summary */}
      {agedRows.length > 0 && (
        <div className="grid grid-cols-5 gap-2">
          {(Object.keys(BUCKET_LABEL) as AgeBucket[]).map(b => (
            <Card key={b} className={`border ${bucketTotals[b] > 0 ? BUCKET_COLOR[b] : "bg-muted/30 text-muted-foreground border-border"}`}>
              <CardContent className="py-3 px-4">
                <p className="text-xs font-medium">{BUCKET_LABEL[b]}</p>
                <p className="text-base font-bold mt-1">
                  {bucketTotals[b] > 0 ? `₹${bucketTotals[b].toLocaleString("en-IN", { minimumFractionDigits: 0 })}` : "—"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-muted-foreground p-4">Loading…</p>
          ) : agedRows.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <p className="text-sm font-medium text-green-700">No outstanding invoices</p>
              <p className="text-xs text-muted-foreground mt-1">All invoices are fully paid.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs border-b">
                  <tr>
                    <th className="px-4 py-2 text-left">Client / Invoice</th>
                    <th className="px-4 py-2 text-left">Invoice Date</th>
                    <th className="px-4 py-2 text-left">Due Date</th>
                    <th className="px-4 py-2 text-right">Invoice Amount</th>
                    <th className="px-4 py-2 text-right">Paid</th>
                    <th className="px-4 py-2 text-right">Balance Due</th>
                    <th className="px-4 py-2 text-center">Age</th>
                  </tr>
                </thead>
                <tbody>
                  {byClient.map(([client, rows]) => (
                    <>
                      <tr key={`hdr-${client}`} className="bg-muted/60">
                        <td colSpan={7} className="px-4 py-1.5 text-xs font-semibold text-foreground">
                          {client}
                          <span className="ml-2 font-normal text-muted-foreground">
                            — {rows.length} invoice{rows.length !== 1 ? "s" : ""} · Total outstanding: ₹{rows.reduce((s, r) => s + r.balance_due, 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>
                      {rows.map(row => (
                        <tr key={row.id} className="border-b hover:bg-muted/20">
                          <td className="px-4 py-2 pl-8 font-medium">{row.doc_number}</td>
                          <td className="px-4 py-2">{format(new Date(row.doc_date), "dd MMM yyyy")}</td>
                          <td className="px-4 py-2">
                            {row.due_date ? format(new Date(row.due_date), "dd MMM yyyy") : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-2 text-right">{fmt(row.total_amount)}</td>
                          <td className="px-4 py-2 text-right text-green-700">{fmt(row.amount_paid)}</td>
                          <td className="px-4 py-2 text-right font-semibold text-red-600">{fmt(row.balance_due)}</td>
                          <td className="px-4 py-2 text-center">
                            <Badge className={`text-[10px] px-1.5 py-0.5 border ${BUCKET_COLOR[row.bucket]}`}>
                              {row.days_overdue > 0
                                ? <><AlertTriangle className="h-2.5 w-2.5 mr-1 inline" />{row.days_overdue}d</>
                                : BUCKET_LABEL[row.bucket]}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-border bg-muted font-semibold">
                  <tr>
                    <td colSpan={5} className="px-4 py-3">TOTAL OUTSTANDING</td>
                    <td className="px-4 py-3 text-right text-red-600">
                      ₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
