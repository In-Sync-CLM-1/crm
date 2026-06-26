import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useAccountingData } from "@/hooks/useAccountingData";
import { format } from "date-fns";

interface EntryLine {
  account_id: string;
  debit: number;
  credit: number;
}
interface RawEntry {
  id: string;
  entry_date: string;
  narration: string;
  lines: EntryLine[];
}

interface RnPLine {
  date: string;
  narration: string;
  amount: number;
  category: string;
}

function fmt(n: number) {
  if (n === 0) return "—";
  return `₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

// Maps a contra account's sub_type / type to a human-readable R&P category
function getCategory(accType: string, accSubType: string, side: "receipt" | "payment"): string {
  if (side === "receipt") {
    if (accType === "income" || accSubType === "operating_revenue") return "Receipts from Operations";
    if (accSubType === "trade_receivables") return "Receipts from Operations";
    if (["director_loan", "long_term_borrowings", "short_term_borrowings"].includes(accSubType)) return "Receipts from Borrowings";
    if (accType === "equity") return "Capital Introduced";
    return "Other Receipts";
  } else {
    if (accSubType === "employee_benefits") return "Salaries & Employee Costs";
    if (accSubType === "finance_cost") return "Finance Costs";
    if (accSubType === "depreciation") return "Depreciation / Non-cash";
    if (accType === "expense") return "Operating Expenses";
    if (["director_loan", "long_term_borrowings"].includes(accSubType)) return "Loan Repayments";
    if (accType === "liability") return "Liabilities Settled";
    if (accSubType === "fixed_asset") return "Capital Expenditure";
    return "Other Payments";
  }
}

function exportCsv(
  fromDate: string, toDate: string, openingBal: number,
  receipts: [string, RnPLine[]][], payments: [string, RnPLine[]][],
  totalReceipts: number, totalPayments: number, closingBal: number
) {
  const rows: string[][] = [
    ["Receipt & Payment Account"],
    [`For the period: ${fromDate} to ${toDate}`],
    [],
    ["Opening Balance", "", openingBal.toFixed(2)],
    [],
    ["RECEIPTS", "", ""],
    ...receipts.flatMap(([cat, lines]) => [
      [cat, "", ""],
      ...lines.map(l => [`  ${l.date} ${l.narration}`, "", l.amount.toFixed(2)]),
    ]),
    ["Total Receipts", "", totalReceipts.toFixed(2)],
    [],
    ["PAYMENTS", "", ""],
    ...payments.flatMap(([cat, lines]) => [
      [cat, "", ""],
      ...lines.map(l => [`  ${l.date} ${l.narration}`, l.amount.toFixed(2), ""]),
    ]),
    ["Total Payments", "", totalPayments.toFixed(2)],
    [],
    ["Closing Balance", "", closingBal.toFixed(2)],
  ];
  const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = `Receipt_Payment_${fromDate}_to_${toDate}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

export function AccountingReceiptPayment({ fromDate, toDate }: { fromDate: string; toDate: string }) {
  const { effectiveOrgId } = useOrgContext();
  const { accounts, accountsLoading } = useAccountingData();
  const [allEntries, setAllEntries] = useState<RawEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!effectiveOrgId) return;
    setLoading(true);
    supabase
      .from("journal_entries")
      .select("id, entry_date, narration, journal_entry_lines(account_id, debit, credit)")
      .eq("org_id", effectiveOrgId)
      .lte("entry_date", toDate)
      .order("entry_date")
      .then(({ data }) => {
        const mapped = (data ?? []).map((e: Record<string, unknown>) => ({
          id: e.id as string,
          entry_date: e.entry_date as string,
          narration: e.narration as string,
          lines: (e.journal_entry_lines as EntryLine[]) ?? [],
        }));
        setAllEntries(mapped);
        setLoading(false);
      });
  }, [effectiveOrgId, toDate]);

  const { openingBalance, receiptsMap, paymentsMap, totalReceipts, totalPayments, closingBalance } = useMemo(() => {
    if (!accounts.length || !allEntries.length) {
      return { openingBalance: 0, receiptsMap: [], paymentsMap: [], totalReceipts: 0, totalPayments: 0, closingBalance: 0 };
    }

    const accMap = new Map(accounts.map(a => [a.id, a]));
    const bankCashIds = new Set(accounts.filter(a => a.is_bank_account || a.sub_type === "cash").map(a => a.id));

    let openingBalance = 0;
    const receiptLines: RnPLine[] = [];
    const paymentLines: RnPLine[] = [];

    for (const entry of allEntries) {
      const isInRange = entry.entry_date >= fromDate && entry.entry_date <= toDate;
      const isBeforeRange = entry.entry_date < fromDate;

      // Find bank/cash movements in this entry
      for (const line of entry.lines) {
        if (!bankCashIds.has(line.account_id)) continue;

        const bankDebit = line.debit;  // money in
        const bankCredit = line.credit; // money out

        if (isBeforeRange) {
          // Accumulate opening balance
          openingBalance += bankDebit - bankCredit;
          continue;
        }
        if (!isInRange) continue;

        // Find contra lines (non-bank/cash) in same entry for categorisation
        const contraLines = entry.lines.filter(l => !bankCashIds.has(l.account_id));
        let category = "Other";
        if (contraLines.length > 0) {
          // Use the first significant contra account
          const primary = contraLines.reduce((best, cl) => {
            return (cl.debit + cl.credit) > (best.debit + best.credit) ? cl : best;
          }, contraLines[0]);
          const acc = accMap.get(primary.account_id);
          if (acc) {
            category = getCategory(acc.type, acc.sub_type, bankDebit > 0 ? "receipt" : "payment");
          }
        }

        if (bankDebit > 0) {
          receiptLines.push({
            date: format(new Date(entry.entry_date), "dd MMM"),
            narration: entry.narration,
            amount: bankDebit,
            category,
          });
        }
        if (bankCredit > 0) {
          paymentLines.push({
            date: format(new Date(entry.entry_date), "dd MMM"),
            narration: entry.narration,
            amount: bankCredit,
            category,
          });
        }
      }
    }

    // Group by category, preserve order
    function groupByCategory(lines: RnPLine[]): [string, RnPLine[]][] {
      const map = new Map<string, RnPLine[]>();
      for (const l of lines) {
        if (!map.has(l.category)) map.set(l.category, []);
        map.get(l.category)!.push(l);
      }
      return [...map.entries()];
    }

    const receiptsMap = groupByCategory(receiptLines);
    const paymentsMap = groupByCategory(paymentLines);
    const totalReceipts = receiptLines.reduce((s, l) => s + l.amount, 0);
    const totalPayments = paymentLines.reduce((s, l) => s + l.amount, 0);
    const closingBalance = openingBalance + totalReceipts - totalPayments;

    return { openingBalance, receiptsMap, paymentsMap, totalReceipts, totalPayments, closingBalance };
  }, [allEntries, accounts, fromDate, toDate]);

  const isLoading = loading || accountsLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          For {format(new Date(fromDate), "dd MMM yyyy")} to {format(new Date(toDate), "dd MMM yyyy")} — cash basis
        </p>
        {(receiptsMap.length > 0 || paymentsMap.length > 0) && (
          <Button variant="outline" size="sm"
            onClick={() => exportCsv(fromDate, toDate, openingBalance, receiptsMap, paymentsMap, totalReceipts, totalPayments, closingBalance)}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="py-4 px-6">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && receiptsMap.length === 0 && paymentsMap.length === 0 && (
            <p className="text-sm text-muted-foreground">No bank/cash movements in this period.</p>
          )}
          {!isLoading && (receiptsMap.length > 0 || paymentsMap.length > 0) && (
            <div className="grid grid-cols-2 gap-8">
              {/* Receipts */}
              <div>
                <p className="font-bold text-sm uppercase tracking-wide border-b pb-1 mb-2">Receipts</p>
                <div className="flex justify-between text-sm font-medium py-1 border-b border-dashed mb-2">
                  <span className="text-muted-foreground">Opening Balance (Bank + Cash)</span>
                  <span>{fmt(openingBalance)}</span>
                </div>
                {receiptsMap.map(([cat, lines]) => (
                  <div key={cat} className="mb-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{cat}</p>
                    {lines.map((l, i) => (
                      <div key={i} className="flex justify-between text-sm py-0.5 pl-4">
                        <span className="truncate mr-2 text-muted-foreground max-w-[180px]" title={l.narration}>
                          <span className="text-foreground font-medium mr-1">{l.date}</span>{l.narration}
                        </span>
                        <span className="shrink-0">{fmt(l.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm font-medium border-t border-dashed pt-0.5 mt-0.5 pl-4">
                      <span className="text-xs text-muted-foreground">Subtotal</span>
                      <span>{fmt(lines.reduce((s, l) => s + l.amount, 0))}</span>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between font-semibold text-sm border-t pt-2 mt-2">
                  <span>Total Receipts</span>
                  <span className="text-green-700">{fmt(totalReceipts)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm border-t-2 border-border pt-2 mt-1 bg-muted/30 rounded px-2 py-1.5">
                  <span>TOTAL</span>
                  <span>{fmt(openingBalance + totalReceipts)}</span>
                </div>
              </div>

              {/* Payments */}
              <div>
                <p className="font-bold text-sm uppercase tracking-wide border-b pb-1 mb-2">Payments</p>
                {paymentsMap.map(([cat, lines]) => (
                  <div key={cat} className="mb-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{cat}</p>
                    {lines.map((l, i) => (
                      <div key={i} className="flex justify-between text-sm py-0.5 pl-4">
                        <span className="truncate mr-2 text-muted-foreground max-w-[180px]" title={l.narration}>
                          <span className="text-foreground font-medium mr-1">{l.date}</span>{l.narration}
                        </span>
                        <span className="shrink-0">{fmt(l.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm font-medium border-t border-dashed pt-0.5 mt-0.5 pl-4">
                      <span className="text-xs text-muted-foreground">Subtotal</span>
                      <span>{fmt(lines.reduce((s, l) => s + l.amount, 0))}</span>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between font-semibold text-sm border-t pt-2 mt-2">
                  <span>Total Payments</span>
                  <span className="text-red-600">{fmt(totalPayments)}</span>
                </div>
                <div className="flex justify-between font-semibold text-sm py-1.5 pl-4">
                  <span className="text-muted-foreground">Closing Balance (Bank + Cash)</span>
                  <span className={closingBalance >= 0 ? "text-green-700" : "text-red-600"}>{fmt(closingBalance)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm border-t-2 border-border pt-2 mt-1 bg-muted/30 rounded px-2 py-1.5">
                  <span>TOTAL</span>
                  <span>{fmt(openingBalance + totalReceipts)}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
