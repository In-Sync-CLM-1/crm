import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, Download } from "lucide-react";
import { useAccountingData } from "@/hooks/useAccountingData";
import type { TrialBalanceRow } from "@/types/accounting";
import { format } from "date-fns";

function fmt(n: number) {
  if (n === 0) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function exportCsv(rows: TrialBalanceRow[], asOf: string) {
  const header = ["Code","Account Name","Type","Debit (₹)","Credit (₹)"];
  const lines = rows.map(r => [
    r.code, r.name, r.type,
    r.total_debit > 0 ? r.total_debit.toFixed(2) : "",
    r.total_credit > 0 ? r.total_credit.toFixed(2) : "",
  ]);
  const totDr = rows.reduce((s, r) => s + r.total_debit, 0);
  const totCr = rows.reduce((s, r) => s + r.total_credit, 0);
  lines.push(["", "TOTAL", "", totDr.toFixed(2), totCr.toFixed(2)]);
  const csv = [header, ...lines].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = `Trial_Balance_${asOf}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

export function AccountingTrialBalance({ asOf, onAccountClick }: {
  asOf: string;
  onAccountClick?: (code: string) => void;
}) {
  const { accounts, accountsLoading, useJournalEntries } = useAccountingData();
  const { data: entries = [], isLoading: entriesLoading } = useJournalEntries(undefined, asOf);

  const { rows, totalDr, totalCr, isBalanced } = useMemo<{
    rows: TrialBalanceRow[];
    totalDr: number;
    totalCr: number;
    isBalanced: boolean;
  }>(() => {
    if (!entries.length || !accounts.length) return { rows: [], totalDr: 0, totalCr: 0, isBalanced: true };

    const accMap = new Map(accounts.map(a => [a.id, a]));
    const totals = new Map<string, { dr: number; cr: number }>();

    for (const entry of entries) {
      for (const line of entry.lines ?? []) {
        const cur = totals.get(line.account_id) ?? { dr: 0, cr: 0 };
        cur.dr += line.debit;
        cur.cr += line.credit;
        totals.set(line.account_id, cur);
      }
    }

    const tbRows: TrialBalanceRow[] = [];
    for (const [accountId, { dr, cr }] of totals.entries()) {
      if (dr === 0 && cr === 0) continue;
      const acc = accMap.get(accountId);
      if (!acc) continue;
      tbRows.push({
        account_id: accountId,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        sub_type: acc.sub_type,
        total_debit: dr,
        total_credit: cr,
        balance: acc.normal_balance === "debit" ? dr - cr : cr - dr,
      });
    }

    tbRows.sort((a, b) => a.code.localeCompare(b.code));

    const totalDr = tbRows.reduce((s, r) => s + r.total_debit, 0);
    const totalCr = tbRows.reduce((s, r) => s + r.total_credit, 0);
    return { rows: tbRows, totalDr, totalCr, isBalanced: Math.abs(totalDr - totalCr) < 0.01 };
  }, [entries, accounts]);

  const loading = accountsLoading || entriesLoading;

  const typeOrder = ["asset","liability","equity","income","expense"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isBalanced ? (
            <Badge className="bg-green-100 text-green-700 border-green-200 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" /> Balanced
            </Badge>
          ) : (
            <Badge className="bg-red-100 text-red-700 border-red-200 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Out of balance by ₹{Math.abs(totalDr - totalCr).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </Badge>
          )}
          <span className="text-sm text-muted-foreground">As at {format(new Date(asOf), "dd MMMM yyyy")}</span>
        </div>
        {rows.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => exportCsv(rows, asOf)}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-muted-foreground p-4">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No journal entries found up to {asOf}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs border-b">
                  <tr>
                    <th className="px-4 py-2 text-left w-16">Code</th>
                    <th className="px-4 py-2 text-left">Account Name</th>
                    <th className="px-4 py-2 text-right">Debit (₹)</th>
                    <th className="px-4 py-2 text-right">Credit (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {typeOrder.map(type => {
                    const group = rows.filter(r => r.type === type);
                    if (group.length === 0) return null;
                    const gDr = group.reduce((s, r) => s + r.total_debit, 0);
                    const gCr = group.reduce((s, r) => s + r.total_credit, 0);
                    return (
                      <>
                        <tr key={`hdr-${type}`} className="bg-muted/60">
                          <td colSpan={4} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </td>
                        </tr>
                        {group.map(row => (
                          <tr key={row.account_id}
                            className={["border-b", onAccountClick ? "cursor-pointer hover:bg-muted/40" : "hover:bg-muted/20"].join(" ")}
                            onClick={onAccountClick ? () => onAccountClick(row.code) : undefined}
                          >
                            <td className="px-4 py-2 text-xs text-muted-foreground">{row.code}</td>
                            <td className={["px-4 py-2", onAccountClick ? "text-primary hover:underline underline-offset-2" : ""].join(" ")}>{row.name}</td>
                            <td className="px-4 py-2 text-right">{fmt(row.total_debit)}</td>
                            <td className="px-4 py-2 text-right">{fmt(row.total_credit)}</td>
                          </tr>
                        ))}
                        <tr key={`sub-${type}`} className="bg-muted/30 text-xs font-medium border-b">
                          <td colSpan={2} className="px-4 py-1.5 text-right text-muted-foreground">Sub-total</td>
                          <td className="px-4 py-1.5 text-right">{fmt(gDr)}</td>
                          <td className="px-4 py-1.5 text-right">{fmt(gCr)}</td>
                        </tr>
                      </>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-border bg-muted font-semibold">
                  <tr>
                    <td colSpan={2} className="px-4 py-3">TOTAL</td>
                    <td className="px-4 py-3 text-right">{fmt(totalDr)}</td>
                    <td className="px-4 py-3 text-right">{fmt(totalCr)}</td>
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
