import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useAccountingData } from "@/hooks/useAccountingData";
import { format } from "date-fns";

function fmt(n: number) {
  if (n === 0) return "—";
  return `₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function BSRow({ label, amount, indent = false, bold = false }: {
  label: string; amount: number; indent?: boolean; bold?: boolean;
}) {
  return (
    <div className={`flex justify-between py-0.5 text-sm ${bold ? "font-semibold" : ""} ${indent ? "pl-6" : ""}`}>
      <span>{label}</span>
      <span>{fmt(amount)}</span>
    </div>
  );
}

function BSSubtotal({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex justify-between font-semibold text-sm border-t pt-1 mt-1">
      <span>{label}</span>
      <span>{fmt(amount)}</span>
    </div>
  );
}

function buildBS(
  entries: Array<{ lines?: Array<{ account_id: string; debit: number; credit: number }> }>,
  accounts: Array<{ id: string; code: string; name: string; type: string; sub_type: string; normal_balance: string; parent_code: string | null }>
) {
  const accMap = new Map(accounts.map(a => [a.id, a]));
  const netByAccount = new Map<string, number>();

  for (const entry of entries) {
    for (const line of entry.lines ?? []) {
      const acc = accMap.get(line.account_id);
      if (!acc) continue;
      const prev = netByAccount.get(line.account_id) ?? 0;
      const delta = acc.normal_balance === "credit"
        ? (line.credit - line.debit)
        : (line.debit - line.credit);
      netByAccount.set(line.account_id, prev + delta);
    }
  }

  function getAmount(code: string) {
    const acc = accounts.find(a => a.code === code);
    if (!acc) return 0;
    return netByAccount.get(acc.id) ?? 0;
  }

  function groupBySubType(subType: string) {
    return accounts
      .filter(a => a.sub_type === subType && !accounts.some(b => b.parent_code === a.code))
      .map(a => ({ label: a.name, amount: netByAccount.get(a.id) ?? 0 }))
      .filter(i => i.amount !== 0)
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  // Compute current year P&L from income – expense
  function sumType(type: string) {
    let total = 0;
    for (const [id, net] of netByAccount.entries()) {
      const acc = accMap.get(id);
      if (!acc || acc.type !== type) continue;
      if (accounts.some(a => a.parent_code === acc.code)) continue;
      total += net;
    }
    return total;
  }
  const currentYearPL = sumType("income") - sumType("expense");
  const retainedEarnings = getAmount("2020");

  // Equity & Liabilities
  const shareCapital        = getAmount("2010");
  const reservesSurplus     = retainedEarnings + currentYearPL;
  const shareholdersFunds   = shareCapital + reservesSurplus;

  const directorLoan        = getAmount("2110");
  const accruedInterest     = getAmount("2111");
  const longTermBorrowings  = directorLoan + accruedInterest;

  const currentLiabItems    = groupBySubType("current_liability");
  const totalCurrentLiab    = currentLiabItems.reduce((s, i) => s + i.amount, 0);
  const totalEquityLiab     = shareholdersFunds + longTermBorrowings + totalCurrentLiab;

  // Assets
  const fixedAssetItems     = groupBySubType("fixed_asset");
  const totalFixedAssets    = fixedAssetItems.reduce((s, i) => s + i.amount, 0);

  const bankAmount          = getAmount("1111");
  const cashAmount          = getAmount("1110");
  const tradeReceivables    = getAmount("1120");
  const tdsReceivable       = getAmount("1150");
  const advancePrepaid      = getAmount("1140");
  const gstInputCgst        = getAmount("1130");
  const gstInputSgst        = getAmount("1131");
  const gstInputIgst        = getAmount("1132");
  const otherCurrentAssets  = getAmount("1160");

  const totalCurrentAssets  =
    bankAmount + cashAmount + tradeReceivables + tdsReceivable +
    advancePrepaid + gstInputCgst + gstInputSgst + gstInputIgst + otherCurrentAssets;
  const totalAssets         = totalFixedAssets + totalCurrentAssets;

  return {
    shareCapital, reservesSurplus, currentYearPL, shareholdersFunds,
    directorLoan, accruedInterest, longTermBorrowings,
    currentLiabItems, totalCurrentLiab, totalEquityLiab,
    fixedAssetItems, totalFixedAssets,
    bankAmount, cashAmount, tradeReceivables, tdsReceivable,
    advancePrepaid, gstInputCgst, gstInputSgst, gstInputIgst, otherCurrentAssets,
    totalCurrentAssets, totalAssets,
  };
}

export function AccountingBalanceSheet({ asOf }: { asOf: string }) {
  const { accounts, accountsLoading, useJournalEntries } = useAccountingData();
  const { data: entries = [], isLoading: entriesLoading } = useJournalEntries(undefined, asOf);

  const bs = useMemo(() => {
    if (!entries.length || !accounts.length) return null;
    return buildBS(entries as Parameters<typeof buildBS>[0], accounts);
  }, [entries, accounts]);

  const loading = accountsLoading || entriesLoading;
  const isBalanced = bs ? Math.abs(bs.totalEquityLiab - bs.totalAssets) < 0.01 : true;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          As at {format(new Date(asOf), "dd MMMM yyyy")}
          {!isBalanced && bs && (
            <span className="ml-3 text-red-600 font-medium text-xs">
              ⚠ Balance sheet is out of balance by ₹{Math.abs(bs.totalEquityLiab - bs.totalAssets).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          )}
        </p>
        {bs && (
          <Button variant="outline" size="sm" onClick={() => {/* pdf export placeholder */}}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="py-4 px-6 space-y-1">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && !bs && <p className="text-sm text-muted-foreground">No journal entries found up to {asOf}.</p>}

          {bs && (
            <>
              <div className="text-center pb-3 border-b mb-3">
                <p className="font-bold text-base">Prosync AI Solutions</p>
                <p className="text-sm text-muted-foreground">Balance Sheet (Schedule III — Companies Act 2013)</p>
                <p className="text-xs text-muted-foreground">As at {format(new Date(asOf), "dd MMMM yyyy")}</p>
              </div>

              {/* ── EQUITY & LIABILITIES ── */}
              <p className="font-bold text-sm uppercase tracking-wide border-b pb-1">EQUITY AND LIABILITIES</p>

              <p className="text-xs font-semibold text-muted-foreground uppercase mt-2">I. Shareholders' Funds</p>
              <BSRow label="(a) Share Capital" amount={bs.shareCapital} indent />
              <div className="pl-6">
                <p className="text-xs text-muted-foreground mt-1">(b) Reserves &amp; Surplus</p>
                <BSRow label="Retained Earnings" amount={bs.reservesSurplus - bs.currentYearPL} indent />
                <BSRow label="Profit for the Period" amount={bs.currentYearPL} indent />
              </div>
              <BSSubtotal label="Total Shareholders' Funds" amount={bs.shareholdersFunds} />

              <p className="text-xs font-semibold text-muted-foreground uppercase mt-3">II. Non-current Liabilities</p>
              <p className="text-xs text-muted-foreground pl-4 mt-1">(a) Long-term Borrowings</p>
              <BSRow label="Loan from Director — Amit Sengupta" amount={bs.directorLoan} indent />
              <BSRow label="Accrued Interest — Director's Loan" amount={bs.accruedInterest} indent />
              <BSSubtotal label="Total Non-current Liabilities" amount={bs.longTermBorrowings} />

              <p className="text-xs font-semibold text-muted-foreground uppercase mt-3">III. Current Liabilities</p>
              {bs.currentLiabItems.map(i => (
                <BSRow key={i.label} label={i.label} amount={i.amount} indent />
              ))}
              {bs.currentLiabItems.length === 0 && (
                <p className="pl-6 text-xs text-muted-foreground">None</p>
              )}
              <BSSubtotal label="Total Current Liabilities" amount={bs.totalCurrentLiab} />

              <div className="border-t-2 border-border mt-2 pt-2">
                <BSRow label="TOTAL (EQUITY AND LIABILITIES)" amount={bs.totalEquityLiab} bold />
              </div>

              {/* ── ASSETS ── */}
              <p className="font-bold text-sm uppercase tracking-wide border-b pb-1 mt-6">ASSETS</p>

              <p className="text-xs font-semibold text-muted-foreground uppercase mt-2">I. Non-current Assets</p>
              <p className="text-xs text-muted-foreground pl-4 mt-1">(a) Fixed Assets (Tangible)</p>
              {bs.fixedAssetItems.map(i => (
                <BSRow key={i.label} label={i.label} amount={i.amount} indent />
              ))}
              {bs.fixedAssetItems.length === 0 && (
                <p className="pl-6 text-xs text-muted-foreground">None</p>
              )}
              <BSSubtotal label="Total Non-current Assets" amount={bs.totalFixedAssets} />

              <p className="text-xs font-semibold text-muted-foreground uppercase mt-3">II. Current Assets</p>
              <BSRow label="Cash in Hand" amount={bs.cashAmount} indent />
              <BSRow label="Bank — IDFC FIRST (A/C 10288101744)" amount={bs.bankAmount} indent />
              <BSRow label="Trade Receivables" amount={bs.tradeReceivables} indent />
              <BSRow label="TDS Receivable" amount={bs.tdsReceivable} indent />
              <BSRow label="Advance &amp; Prepaid Expenses" amount={bs.advancePrepaid} indent />
              {(bs.gstInputCgst + bs.gstInputSgst + bs.gstInputIgst) > 0 && (
                <>
                  <BSRow label="GST Input Credit — CGST" amount={bs.gstInputCgst} indent />
                  <BSRow label="GST Input Credit — SGST" amount={bs.gstInputSgst} indent />
                  <BSRow label="GST Input Credit — IGST" amount={bs.gstInputIgst} indent />
                </>
              )}
              {bs.otherCurrentAssets > 0 && (
                <BSRow label="Other Current Assets" amount={bs.otherCurrentAssets} indent />
              )}
              <BSSubtotal label="Total Current Assets" amount={bs.totalCurrentAssets} />

              <div className="border-t-2 border-border mt-2 pt-2">
                <BSRow label="TOTAL (ASSETS)" amount={bs.totalAssets} bold />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
