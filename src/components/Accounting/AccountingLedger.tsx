import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Download, Paperclip, Pencil } from "lucide-react";
import { useAccountingData } from "@/hooks/useAccountingData";
import { useOrgContext } from "@/hooks/useOrgContext";
import { supabase } from "@/integrations/supabase/client";
import { JournalEntryEditDialog } from "./JournalEntryEditDialog";
import { isProsyncIssuedDoc } from "@/utils/billingUtils";
import type { LedgerRow, ChartOfAccount, JournalEntry } from "@/types/accounting";
import { format, startOfYear, endOfYear } from "date-fns";

type LedgerMode = "account" | "party";

interface PartyRow {
  date: string;
  ref: string;
  type: "invoice" | "credit_note" | "receipt" | "tds";
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
  seller_snapshot?: unknown;
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

function exportAccountCsv(account: ChartOfAccount, rows: LedgerRow[], openingBalance: number) {
  const header = ["Date", "Particulars", "J.F.", "Debit (₹)", "Credit (₹)", "Balance (₹)"];
  const lines: string[][] = [
    ["Opening Balance", "", "", "", "", openingBalance.toFixed(2)],
    ...rows.map(r => [
      format(new Date(r.entry_date), "dd/MM/yyyy"),
      r.narration,
      r.source === "bank_import" ? "BK" : r.source === "system_interest" ? "SYS" : "JNL",
      r.debit > 0 ? r.debit.toFixed(2) : "",
      r.credit > 0 ? r.credit.toFixed(2) : "",
      r.running_balance.toFixed(2),
    ]),
  ];
  const csv = [header, ...lines].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = `Ledger_${account.code}_${account.name.replace(/\s+/g, "_")}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function exportPartyCsv(client: string, rows: PartyRow[]) {
  const header = ["Date", "Ref", "Type", "Dr (₹)", "Cr (₹)", "Balance (₹)"];
  let bal = 0;
  const lines = rows.map(r => {
    bal += r.dr - r.cr;
    return [r.date, r.ref, r.type, r.dr > 0 ? r.dr.toFixed(2) : "", r.cr > 0 ? r.cr.toFixed(2) : "", bal.toFixed(2)];
  });
  const csv = [header, ...lines].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = `Party_Ledger_${client.replace(/\s+/g, "_")}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

const PARTY_TYPE_LABEL: Record<string, string> = { invoice: "Invoice", credit_note: "Credit Note", receipt: "Receipt", tds: "TDS" };
const PARTY_TYPE_COLOR: Record<string, string> = { invoice: "text-blue-700", credit_note: "text-purple-700", receipt: "text-green-700", tds: "text-amber-700" };

export function AccountingLedger({ defaultAccountCode }: { defaultAccountCode?: string }) {
  const { accounts, accountsLoading, useJournalEntries } = useAccountingData();
  const { effectiveOrgId } = useOrgContext();

  const [mode, setMode] = useState<LedgerMode>("account");
  const [selectedCode, setSelectedCode] = useState(defaultAccountCode ?? "1111");
  const [selectedParty, setSelectedParty] = useState("");
  const [comboOpen, setComboOpen] = useState(false);
  const [fromDate, setFromDate] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(endOfYear(new Date()), "yyyy-MM-dd"));
  const [editEntry, setEditEntry] = useState<JournalEntry | null>(null);

  const [parties, setParties] = useState<string[]>([]);
  const [partyDocs, setPartyDocs] = useState<BillingDoc[]>([]);
  const [partyPayments, setPartyPayments] = useState<BillingPayment[]>([]);
  const [partyLoading, setPartyLoading] = useState(false);

  useEffect(() => {
    if (defaultAccountCode) { setMode("account"); setSelectedCode(defaultAccountCode); }
  }, [defaultAccountCode]);

  // Load distinct party (customer) names once — Prosync-issued documents only,
  // since this Accounting module represents Prosync's books, not ECR's.
  useEffect(() => {
    if (!effectiveOrgId) return;
    supabase
      .from("billing_documents")
      .select("client_name, seller_snapshot")
      .eq("org_id", effectiveOrgId)
      .in("doc_type", ["invoice", "credit_note"])
      .then(({ data }) => {
        const names = [...new Set(
          (data ?? []).filter(isProsyncIssuedDoc).map((r: { client_name: string }) => r.client_name)
        )].sort();
        setParties(names);
      });
  }, [effectiveOrgId]);

  // Party-mode data: docs + payments for the selected client + period
  useEffect(() => {
    if (mode !== "party" || !effectiveOrgId || !selectedParty) return;
    setPartyLoading(true);
    supabase
      .from("billing_documents")
      .select("id, doc_number, doc_type, doc_date, client_name, total_amount, subtotal, balance_due, amount_paid, status, seller_snapshot")
      .eq("org_id", effectiveOrgId)
      .eq("client_name", selectedParty)
      .in("doc_type", ["invoice", "credit_note"])
      .gte("doc_date", fromDate)
      .lte("doc_date", toDate)
      .order("doc_date")
      .then(({ data: docsData }) => {
        const docList = ((docsData ?? []) as BillingDoc[]).filter(isProsyncIssuedDoc);
        setPartyDocs(docList);
        if (docList.length === 0) { setPartyPayments([]); setPartyLoading(false); return; }
        const docIds = docList.map(d => d.id);
        supabase
          .from("billing_payments")
          .select("id, document_id, payment_date, amount, tds_amount, reference_number")
          .in("document_id", docIds)
          .order("payment_date")
          .then(({ data: pmtData }) => {
            setPartyPayments((pmtData ?? []) as BillingPayment[]);
            setPartyLoading(false);
          });
      });
  }, [mode, effectiveOrgId, selectedParty, fromDate, toDate]);

  const { data: entries = [], isLoading: entriesLoading } = useJournalEntries(fromDate, toDate);

  const selectedAccount = accounts.find(a => a.code === selectedCode);

  const { openingBalance, rows } = useMemo(() => {
    if (!selectedAccount) return { openingBalance: 0, rows: [] };
    const isDebitNormal = selectedAccount.normal_balance === "debit";
    let runningBal = 0;
    const ledgerRows: LedgerRow[] = [];

    const allEntriesForAccount = entries
      .filter(e => e.lines?.some(l => l.account_id === selectedAccount.id))
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date));

    for (const entry of allEntriesForAccount) {
      const line = entry.lines?.find(l => l.account_id === selectedAccount.id);
      if (!line) continue;
      const dr = line.debit;
      const cr = line.credit;
      runningBal += isDebitNormal ? (dr - cr) : (cr - dr);
      ledgerRows.push({
        entry_id: entry.id,
        entry_date: entry.entry_date,
        narration: entry.narration,
        reference: entry.reference,
        source: entry.source,
        debit: dr,
        credit: cr,
        running_balance: runningBal,
        invoice_url: entry.invoice_url ?? null,
      });
    }
    return { openingBalance: 0, rows: ledgerRows };
  }, [entries, selectedAccount]);

  const { rows: partyRows, closingBalance: partyClosing } = useMemo(() => {
    const list: PartyRow[] = [];
    const pmtByDoc = new Map<string, BillingPayment[]>();
    for (const p of partyPayments) {
      if (!pmtByDoc.has(p.document_id)) pmtByDoc.set(p.document_id, []);
      pmtByDoc.get(p.document_id)!.push(p);
    }

    for (const doc of partyDocs) {
      if (doc.doc_type === "invoice") {
        list.push({ date: doc.doc_date, ref: doc.doc_number, type: "invoice", description: "Invoice raised", dr: doc.total_amount, cr: 0 });
      } else {
        list.push({ date: doc.doc_date, ref: doc.doc_number, type: "credit_note", description: "Credit Note issued", dr: 0, cr: doc.total_amount });
      }
      // Money received from the customer against a tax invoice is a Receipt, not a Payment —
      // "Payment" in this ledger would misleadingly read as money going out.
      for (const p of pmtByDoc.get(doc.id) ?? []) {
        if (p.amount > 0) {
          list.push({ date: p.payment_date, ref: doc.doc_number, type: "receipt", description: `Receipt — ${p.reference_number ?? "bank transfer"}`, dr: 0, cr: p.amount });
        }
        if (p.tds_amount > 0) {
          list.push({ date: p.payment_date, ref: doc.doc_number, type: "tds", description: "TDS deducted at source", dr: 0, cr: p.tds_amount });
        }
      }
    }
    list.sort((a, b) => a.date.localeCompare(b.date));
    const closingBalance = list.reduce((s, r) => s + r.dr - r.cr, 0);
    return { rows: list, closingBalance };
  }, [partyDocs, partyPayments]);

  const leafAccounts = accounts.filter(a => !accounts.some(b => b.parent_code === a.code));

  function openEdit(entryId: string) {
    const found = entries.find(e => e.id === entryId) ?? null;
    setEditEntry(found);
  }

  const comboLabel = mode === "account"
    ? (selectedAccount ? `${selectedAccount.code} — ${selectedAccount.name}` : "Select account…")
    : (selectedParty || "Select party…");

  let partyRunningBal = 0;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Account / Party</label>
          <Popover open={comboOpen} onOpenChange={setComboOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-80 h-9 justify-start font-normal">
                <span className="truncate">{comboLabel}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search accounts or parties…" />
                <CommandList>
                  <CommandEmpty>No matches found.</CommandEmpty>
                  <CommandGroup heading="General Ledger Accounts">
                    {leafAccounts.map(a => (
                      <CommandItem
                        key={a.id}
                        value={`${a.code} ${a.name}`}
                        onSelect={() => { setMode("account"); setSelectedCode(a.code); setComboOpen(false); }}
                      >
                        <span className="text-xs text-muted-foreground w-10 shrink-0">{a.code}</span>
                        {a.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  {parties.length > 0 && (
                    <CommandGroup heading="Parties (Customers)">
                      {parties.map(p => (
                        <CommandItem
                          key={p}
                          value={p}
                          onSelect={() => { setMode("party"); setSelectedParty(p); setComboOpen(false); }}
                        >
                          {p}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
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
        {mode === "account" && selectedAccount && rows.length > 0 && (
          <Button variant="outline" size="sm" className="h-9" onClick={() => exportAccountCsv(selectedAccount, rows, openingBalance)}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
        )}
        {mode === "party" && partyRows.length > 0 && (
          <Button variant="outline" size="sm" className="h-9" onClick={() => exportPartyCsv(selectedParty, partyRows)}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
        )}
      </div>

      {mode === "account" ? (
        <Card>
          <CardHeader className="py-3 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">
                {selectedAccount ? `${selectedAccount.code} — ${selectedAccount.name}` : "Select an account"}
              </CardTitle>
              {rows.length > 0 && (
                <span className="text-sm font-semibold">
                  Closing Balance:{" "}
                  <span className={rows.at(-1)!.running_balance >= 0 ? "text-green-600" : "text-red-600"}>
                    ₹{Math.abs(rows.at(-1)!.running_balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    {rows.at(-1)!.running_balance < 0 ? " Cr" : selectedAccount?.normal_balance === "credit" ? " Cr" : " Dr"}
                  </span>
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {entriesLoading || accountsLoading ? (
              <p className="text-sm text-muted-foreground p-4">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">No entries for this account in the selected period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-xs">
                    <tr>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">Particulars</th>
                      <th className="px-4 py-2 text-center">J.F.</th>
                      <th className="px-4 py-2 text-right">Debit (₹)</th>
                      <th className="px-4 py-2 text-right">Credit (₹)</th>
                      <th className="px-4 py-2 text-right">Balance (₹)</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr className="bg-muted/30 font-medium text-xs">
                      <td className="px-4 py-2">{format(new Date(fromDate), "dd MMM yyyy")}</td>
                      <td className="px-4 py-2 text-muted-foreground">Opening Balance</td>
                      <td /><td /><td />
                      <td className="px-4 py-2 text-right">{fmt(openingBalance)}</td>
                      <td />
                    </tr>
                    {rows.map(row => (
                      <tr
                        key={row.entry_id}
                        className="hover:bg-muted/30 transition-colors cursor-pointer group"
                        onClick={() => openEdit(row.entry_id)}
                      >
                        <td className="px-4 py-2 whitespace-nowrap">{format(new Date(row.entry_date), "dd MMM yyyy")}</td>
                        <td className="px-4 py-2 max-w-xs">
                          <p className="truncate group-hover:text-primary">{row.narration}</p>
                          {row.reference && <p className="text-xs text-muted-foreground">{row.reference}</p>}
                        </td>
                        <td className="px-4 py-2 text-center text-xs text-muted-foreground">
                          {row.source === "bank_import" ? "BK" : row.source === "system_interest" ? "SYS" : "JNL"}
                        </td>
                        <td className="px-4 py-2 text-right">{fmt(row.debit)}</td>
                        <td className="px-4 py-2 text-right">{fmt(row.credit)}</td>
                        <td className="px-4 py-2 text-right font-medium">
                          ₹{Math.abs(row.running_balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          <span className="text-xs text-muted-foreground ml-1">
                            {row.running_balance < 0 ? "Cr" : "Dr"}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          {row.invoice_url ? (
                            <a
                              href={row.invoice_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="View invoice"
                              className="text-muted-foreground hover:text-foreground inline-flex"
                              onClick={e => e.stopPropagation()}
                            >
                              <Paperclip className="h-3.5 w-3.5" />
                            </a>
                          ) : (
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="py-3 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{selectedParty || "Select a party"}</CardTitle>
              {partyRows.length > 0 && (
                <span className="text-sm font-semibold">
                  Outstanding:{" "}
                  <span className={partyClosing > 0 ? "text-red-600" : "text-green-600"}>
                    {fmt(Math.abs(partyClosing))}
                    {partyClosing > 0 ? " receivable" : partyClosing < 0 ? " overpaid" : ""}
                  </span>
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!selectedParty ? (
              <p className="text-sm text-muted-foreground p-4">Search and select a party above.</p>
            ) : partyLoading ? (
              <p className="text-sm text-muted-foreground p-4">Loading…</p>
            ) : partyRows.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">No transactions for this party in the selected period.</p>
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
                    {partyRows.map((row, i) => {
                      partyRunningBal += row.dr - row.cr;
                      return (
                        <tr key={i} className="hover:bg-muted/20">
                          <td className="px-4 py-2 whitespace-nowrap">{format(new Date(row.date), "dd MMM yyyy")}</td>
                          <td className="px-4 py-2 font-medium">{row.ref}</td>
                          <td className={`px-4 py-2 text-xs font-medium ${PARTY_TYPE_COLOR[row.type]}`}>{PARTY_TYPE_LABEL[row.type]}</td>
                          <td className="px-4 py-2 text-muted-foreground max-w-xs truncate">{row.description}</td>
                          <td className="px-4 py-2 text-right">{fmt(row.dr)}</td>
                          <td className="px-4 py-2 text-right">{fmt(row.cr)}</td>
                          <td className="px-4 py-2 text-right font-medium">
                            {partyRunningBal !== 0 ? `₹${Math.abs(partyRunningBal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
                            {partyRunningBal > 0 && <span className="text-xs text-muted-foreground ml-1">Dr</span>}
                            {partyRunningBal < 0 && <span className="text-xs text-muted-foreground ml-1">Cr</span>}
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
      )}

      <JournalEntryEditDialog
        entry={editEntry}
        accounts={accounts}
        open={!!editEntry}
        onClose={() => setEditEntry(null)}
      />
    </div>
  );
}
