import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { format, startOfYear, endOfYear } from "date-fns";

interface PartyRow {
  date: string;
  ref: string;
  type: "invoice" | "credit_note" | "payment" | "tds";
  description: string;
  dr: number;
  cr: number;
}

interface BillingDoc {
  id: string;
  doc_number: string;
  doc_type: string;
  doc_date: string;
  client_name: string;
  total_amount: number;
  subtotal: number;
  balance_due: number;
  amount_paid: number;
  status: string;
}

interface BillingPayment {
  id: string;
  document_id: string;
  payment_date: string;
  amount: number;
  tds_amount: number;
  reference_number: string | null;
}

function fmt(n: number) {
  if (n === 0) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function exportCsv(client: string, rows: PartyRow[], openingBal: number) {
  const header = ["Date", "Ref", "Type", "Dr (₹)", "Cr (₹)", "Balance (₹)"];
  let bal = openingBal;
  const lines = [
    ["", "Opening Balance", "", "", "", bal.toFixed(2)],
    ...rows.map(r => {
      bal += r.dr - r.cr;
      return [r.date, r.ref, r.type, r.dr > 0 ? r.dr.toFixed(2) : "", r.cr > 0 ? r.cr.toFixed(2) : "", bal.toFixed(2)];
    }),
  ];
  const csv = [header, ...lines].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = `Party_Ledger_${client.replace(/\s+/g, "_")}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

export function AccountingPartyLedger() {
  const { effectiveOrgId } = useOrgContext();

  const [clients, setClients] = useState<string[]>([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [fromDate, setFromDate] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(endOfYear(new Date()), "yyyy-MM-dd"));
  const [docs, setDocs] = useState<BillingDoc[]>([]);
  const [payments, setPayments] = useState<BillingPayment[]>([]);
  const [loading, setLoading] = useState(false);

  // Load distinct client names
  useEffect(() => {
    if (!effectiveOrgId) return;
    supabase
      .from("billing_documents")
      .select("client_name")
      .eq("org_id", effectiveOrgId)
      .in("doc_type", ["invoice", "credit_note"])
      .then(({ data }) => {
        const names = [...new Set((data ?? []).map((r: { client_name: string }) => r.client_name))].sort();
        setClients(names);
        if (names.length > 0 && !selectedClient) setSelectedClient(names[0]);
      });
  }, [effectiveOrgId]);

  // Load docs + payments for selected client + period
  useEffect(() => {
    if (!effectiveOrgId || !selectedClient) return;
    setLoading(true);
    Promise.all([
      supabase
        .from("billing_documents")
        .select("id, doc_number, doc_type, doc_date, client_name, total_amount, subtotal, balance_due, amount_paid, status")
        .eq("org_id", effectiveOrgId)
        .eq("client_name", selectedClient)
        .in("doc_type", ["invoice", "credit_note"])
        .gte("doc_date", fromDate)
        .lte("doc_date", toDate)
        .order("doc_date"),
    ]).then(([{ data: docsData }]) => {
      const docList = (docsData ?? []) as BillingDoc[];
      setDocs(docList);
      if (docList.length === 0) { setPayments([]); setLoading(false); return; }
      const docIds = docList.map(d => d.id);
      supabase
        .from("billing_payments")
        .select("id, document_id, payment_date, amount, tds_amount, reference_number")
        .in("document_id", docIds)
        .order("payment_date")
        .then(({ data: pmtData }) => {
          setPayments((pmtData ?? []) as BillingPayment[]);
          setLoading(false);
        });
    });
  }, [effectiveOrgId, selectedClient, fromDate, toDate]);

  const { rows, closingBalance } = useMemo(() => {
    const list: PartyRow[] = [];
    const pmtByDoc = new Map<string, BillingPayment[]>();
    for (const p of payments) {
      if (!pmtByDoc.has(p.document_id)) pmtByDoc.set(p.document_id, []);
      pmtByDoc.get(p.document_id)!.push(p);
    }

    for (const doc of docs) {
      if (doc.doc_type === "invoice") {
        list.push({ date: doc.doc_date, ref: doc.doc_number, type: "invoice", description: "Invoice raised", dr: doc.total_amount, cr: 0 });
      } else {
        list.push({ date: doc.doc_date, ref: doc.doc_number, type: "credit_note", description: "Credit Note issued", dr: 0, cr: doc.total_amount });
      }
      for (const p of pmtByDoc.get(doc.id) ?? []) {
        if (p.amount > 0) {
          list.push({ date: p.payment_date, ref: doc.doc_number, type: "payment", description: `Payment — ${p.reference_number ?? "bank transfer"}`, dr: 0, cr: p.amount });
        }
        if (p.tds_amount > 0) {
          list.push({ date: p.payment_date, ref: doc.doc_number, type: "tds", description: "TDS deducted at source", dr: 0, cr: p.tds_amount });
        }
      }
    }
    list.sort((a, b) => a.date.localeCompare(b.date));
    const closingBalance = list.reduce((s, r) => s + r.dr - r.cr, 0);
    return { rows: list, closingBalance };
  }, [docs, payments]);

  const TYPE_LABEL: Record<string, string> = { invoice: "Invoice", credit_note: "Credit Note", payment: "Payment", tds: "TDS" };
  const TYPE_COLOR: Record<string, string> = { invoice: "text-blue-700", credit_note: "text-purple-700", payment: "text-green-700", tds: "text-amber-700" };

  let runningBal = 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Client</label>
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="w-64 h-9">
              <SelectValue placeholder="Select client…" />
            </SelectTrigger>
            <SelectContent>
              {clients.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">From</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="h-9 px-3 border border-input rounded-md text-sm bg-background" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">To</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="h-9 px-3 border border-input rounded-md text-sm bg-background" />
        </div>
        {rows.length > 0 && (
          <Button variant="outline" size="sm" className="h-9"
            onClick={() => exportCsv(selectedClient, rows, 0)}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="py-3 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">{selectedClient || "No client selected"}</CardTitle>
            {rows.length > 0 && (
              <span className="text-sm font-semibold">
                Outstanding:{" "}
                <span className={closingBalance > 0 ? "text-red-600" : "text-green-600"}>
                  {fmt(Math.abs(closingBalance))}
                  {closingBalance > 0 ? " receivable" : closingBalance < 0 ? " overpaid" : ""}
                </span>
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-muted-foreground p-4">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No transactions for this client in the selected period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs">
                  <tr>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Reference</th>
                    <th className="px-4 py-2 text-left">Type</th>
                    <th className="px-4 py-2 text-left">Description</th>
                    <th className="px-4 py-2 text-right">Dr (₹)</th>
                    <th className="px-4 py-2 text-right">Cr (₹)</th>
                    <th className="px-4 py-2 text-right">Balance (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row, i) => {
                    runningBal += row.dr - row.cr;
                    return (
                      <tr key={i} className="hover:bg-muted/20">
                        <td className="px-4 py-2 whitespace-nowrap">{format(new Date(row.date), "dd MMM yyyy")}</td>
                        <td className="px-4 py-2 font-medium">{row.ref}</td>
                        <td className={`px-4 py-2 text-xs font-medium ${TYPE_COLOR[row.type]}`}>{TYPE_LABEL[row.type]}</td>
                        <td className="px-4 py-2 text-muted-foreground max-w-xs truncate">{row.description}</td>
                        <td className="px-4 py-2 text-right">{fmt(row.dr)}</td>
                        <td className="px-4 py-2 text-right">{fmt(row.cr)}</td>
                        <td className="px-4 py-2 text-right font-medium">
                          {runningBal !== 0 ? `₹${Math.abs(runningBal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
                          {runningBal > 0 && <span className="text-xs text-muted-foreground ml-1">Dr</span>}
                          {runningBal < 0 && <span className="text-xs text-muted-foreground ml-1">Cr</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
