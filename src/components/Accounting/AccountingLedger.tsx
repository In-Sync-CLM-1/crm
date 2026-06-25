import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useAccountingData } from "@/hooks/useAccountingData";
import type { LedgerRow, ChartOfAccount } from "@/types/accounting";
import { format, startOfYear, endOfYear } from "date-fns";

function fmt(n: number) {
  if (n === 0) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function exportCsv(account: ChartOfAccount, rows: LedgerRow[], openingBalance: number) {
  const header = ["Date","Particulars","J.F.","Debit (₹)","Credit (₹)","Balance (₹)"];
  const lines: string[][] = [
    ["Opening Balance","","","","",openingBalance.toFixed(2)],
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
  a.download = `Ledger_${account.code}_${account.name.replace(/\s+/g,"_")}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

export function AccountingLedger() {
  const { accounts, accountsLoading, useJournalEntries } = useAccountingData();
  const [selectedCode, setSelectedCode] = useState("1111");
  const [fromDate, setFromDate] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [toDate,   setToDate]   = useState(format(endOfYear(new Date()),   "yyyy-MM-dd"));

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
        entry_id:        entry.id,
        entry_date:      entry.entry_date,
        narration:       entry.narration,
        reference:       entry.reference,
        source:          entry.source,
        debit:           dr,
        credit:          cr,
        running_balance: runningBal,
      });
    }
    return { openingBalance: 0, rows: ledgerRows };
  }, [entries, selectedAccount]);

  const leafAccounts = accounts.filter(a => !accounts.some(b => b.parent_code === a.code));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Account</label>
          <Select value={selectedCode} onValueChange={setSelectedCode}>
            <SelectTrigger className="w-72 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {leafAccounts.map(a => (
                <SelectItem key={a.id} value={a.code}>
                  {a.code} — {a.name}
                </SelectItem>
              ))}
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
        {selectedAccount && rows.length > 0 && (
          <Button variant="outline" size="sm" className="h-9" onClick={() => exportCsv(selectedAccount, rows, openingBalance)}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
        )}
      </div>

      {/* Ledger table */}
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr className="bg-muted/30 font-medium text-xs">
                    <td className="px-4 py-2">{format(new Date(fromDate), "dd MMM yyyy")}</td>
                    <td className="px-4 py-2 text-muted-foreground">Opening Balance</td>
                    <td /><td /><td />
                    <td className="px-4 py-2 text-right">{fmt(openingBalance)}</td>
                  </tr>
                  {rows.map(row => (
                    <tr key={row.entry_id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2 whitespace-nowrap">{format(new Date(row.entry_date), "dd MMM yyyy")}</td>
                      <td className="px-4 py-2 max-w-xs">
                        <p className="truncate">{row.narration}</p>
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
