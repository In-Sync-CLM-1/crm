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

function BSRow({ label, amount, indent = false, bold = false, accountCode, onAccountClick }: {
  label: string;
  amount: number;
  indent?: boolean;
  bold?: boolean;
  accountCode?: string;
  onAccountClick?: (code: string) => void;
}) {
  const clickable = !!accountCode && !!onAccountClick;
  return (
    <div
      className={[
        "flex justify-between py-0.5 text-sm rounded-sm",
        bold ? "font-semibold" : "",
        indent ? "pl-6" : "",
        clickable ? "cursor-pointer hover:bg-muted/60 -mx-1 px-1 group" : "",
      ].join(" ")}
      onClick={clickable ? () => onAccountClick!(accountCode!) : undefined}
    >
      <span className={clickable ? "text-primary group-hover:underline underline-offset-2" : ""}>{label}</span>
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
      .map(a => ({ label: a.name, amount: netByAccount.get(a.id) ?? 0, code: a.code }))
      .filter(i => i.amount !== 0)
      .sort((a, b) => a.label.localeCompare(b.label));
  }

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

  const shareCapital        = getAmount("2010");
  const reservesSurplus     = retainedEarnings + currentYearPL;
  const shareholdersFunds   = shareCapital + reservesSurplus;

  const directorLoan        = getAmount("2110");
  const accruedInterest     = getAmount("2111");
  const longTermBorrowings  = directorLoan + accruedInterest;

  const currentLiabItems    = groupBySubType("current_liability");
  const totalCurrentLiab    = currentLiabItems.reduce((s, i) => s + i.amount, 0);
  const totalEquityLiab     = shareholdersFunds + longTermBorrowings + totalCurrentLiab;

  const fixedAssetItems     = groupBySubType("fixed_asset");
  const accDepItems         = groupBySubType("accumulated_depreciation");
  const grossFixedAssets    = fixedAssetItems.reduce((s, i) => s + i.amount, 0);
  const totalAccDep         = accDepItems.reduce((s, i) => s + i.amount, 0);
  const totalFixedAssets    = grossFixedAssets - totalAccDep; // Net Block

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
    shareCapital, reservesSurplus, currentYearPL, retainedEarnings, shareholdersFunds,
    directorLoan, accruedInterest, longTermBorrowings,
    currentLiabItems, totalCurrentLiab, totalEquityLiab,
    fixedAssetItems, accDepItems, grossFixedAssets, totalAccDep, totalFixedAssets,
    bankAmount, cashAmount, tradeReceivables, tdsReceivable,
    advancePrepaid, gstInputCgst, gstInputSgst, gstInputIgst, otherCurrentAssets,
    totalCurrentAssets, totalAssets,
  };
}

export function AccountingBalanceSheet({
  asOf,
  onAccountClick,
}: {
  asOf: string;
  onAccountClick?: (code: string) => void;
}) {
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
          {onAccountClick && (
            <span className="ml-3 text-xs text-muted-foreground">Click any account to view its ledger</span>
          )}
        </p>
        {bs && (
          <Button variant="outline" size="sm" onClick={() => {/* pdf export placeholder */}}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="py-4 px-6">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && !bs && <p className="text-sm text-muted-foreground">No journal entries found up to {asOf}.</p>}

          {bs && (
            <>
              <div className="text-center pb-3 border-b mb-3">
                <p className="font-bold text-base">Prosync AI Solutions</p>
                <p className="text-sm text-muted-foreground">Balance Sheet</p>
                <p className="text-xs text-muted-foreground">As at {format(new Date(asOf), "dd MMMM yyyy")}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-0 md:divide-x">
                {/* ── LIABILITIES (left) ── */}
                <div className="space-y-1 md:pr-6">
                  <p className="font-bold text-sm uppercase tracking-wide border-b pb-1">Liabilities</p>

                  <p className="text-xs font-semibold text-muted-foreground uppercase mt-2">Capital Account</p>
                  <BSRow label="Share Capital" amount={bs.shareCapital} indent
                    accountCode="2010" onAccountClick={onAccountClick} />

                  <p className="text-xs font-semibold text-muted-foreground uppercase mt-3">Reserves &amp; Surplus</p>
                  <BSRow label="Retained Earnings" amount={bs.retainedEarnings} indent
                    accountCode="2020" onAccountClick={onAccountClick} />
                  <BSRow label="Profit for the Period" amount={bs.currentYearPL} indent />
                  <BSSubtotal label="Total Capital &amp; Reserves" amount={bs.shareholdersFunds} />

                  <p className="text-xs font-semibold text-muted-foreground uppercase mt-3">Unsecured Loans</p>
                  <BSRow label="Loan from Director — Amit Sengupta" amount={bs.directorLoan} indent
                    accountCode="2110" onAccountClick={onAccountClick} />
                  <BSRow label="Accrued Interest — Director's Loan" amount={bs.accruedInterest} indent
                    accountCode="2111" onAccountClick={onAccountClick} />
                  <BSSubtotal label="Total Loans" amount={bs.longTermBorrowings} />

                  <p className="text-xs font-semibold text-muted-foreground uppercase mt-3">Current Liabilities &amp; Provisions</p>
                  {bs.currentLiabItems.map(i => (
                    <BSRow key={i.label} label={i.label} amount={i.amount} indent
                      accountCode={i.code} onAccountClick={onAccountClick} />
                  ))}
                  {bs.currentLiabItems.length === 0 && (
                    <p className="pl-6 text-xs text-muted-foreground">None</p>
                  )}
                  <BSSubtotal label="Total Current Liabilities" amount={bs.totalCurrentLiab} />

                  <div className="border-t-2 border-border mt-2 pt-2">
                    <BSRow label="Total Liabilities" amount={bs.totalEquityLiab} bold />
                  </div>
                </div>

                {/* ── ASSETS (right) ── */}
                <div className="space-y-1 md:pl-6">
                  <p className="font-bold text-sm uppercase tracking-wide border-b pb-1">Assets</p>

                  <p className="text-xs font-semibold text-muted-foreground uppercase mt-2">Fixed Assets</p>
                  {bs.fixedAssetItems.length === 0 && (
                    <p className="pl-6 text-xs text-muted-foreground">None</p>
                  )}
                  {bs.fixedAssetItems.map(i => (
                    <BSRow key={i.label} label={i.label} amount={i.amount} indent
                      accountCode={i.code} onAccountClick={onAccountClick} />
                  ))}
                  {bs.fixedAssetItems.length > 0 && (
                    <div className="pl-6 flex justify-between text-xs text-muted-foreground border-t border-dashed pt-0.5 mt-0.5">
                      <span>Gross Block</span>
                      <span>{fmt(bs.grossFixedAssets)}</span>
                    </div>
                  )}
                  {bs.accDepItems.length > 0 && (
                    <>
                      <p className="text-xs text-muted-foreground pl-4 mt-1">Less: Accumulated Depreciation</p>
                      {bs.accDepItems.map(i => (
                        <BSRow key={i.label} label={i.label} amount={i.amount} indent
                          accountCode={i.code} onAccountClick={onAccountClick} />
                      ))}
                      <div className="pl-6 flex justify-between text-xs text-muted-foreground border-t border-dashed pt-0.5 mt-0.5">
                        <span>Total Accumulated Depreciation</span>
                        <span className="text-red-600">({fmt(bs.totalAccDep)})</span>
                      </div>
                    </>
                  )}
                  <BSSubtotal label="Net Block (Fixed Assets)" amount={bs.totalFixedAssets} />

                  <p className="text-xs font-semibold text-muted-foreground uppercase mt-3">Current Assets, Loans &amp; Advances</p>
                  <BSRow label="Cash in Hand" amount={bs.cashAmount} indent
                    accountCode="1110" onAccountClick={onAccountClick} />
                  <BSRow label="Bank — IDFC FIRST (A/C 10288101744)" amount={bs.bankAmount} indent
                    accountCode="1111" onAccountClick={onAccountClick} />
                  <BSRow label="Trade Receivables" amount={bs.tradeReceivables} indent
                    accountCode="1120" onAccountClick={onAccountClick} />
                  <BSRow label="TDS Receivable" amount={bs.tdsReceivable} indent
                    accountCode="1150" onAccountClick={onAccountClick} />
                  <BSRow label="Advance &amp; Prepaid Expenses" amount={bs.advancePrepaid} indent
                    accountCode="1140" onAccountClick={onAccountClick} />
                  {(bs.gstInputCgst + bs.gstInputSgst + bs.gstInputIgst) > 0 && (
                    <>
                      <BSRow label="GST Input Credit — CGST" amount={bs.gstInputCgst} indent
                        accountCode="1130" onAccountClick={onAccountClick} />
                      <BSRow label="GST Input Credit — SGST" amount={bs.gstInputSgst} indent
                        accountCode="1131" onAccountClick={onAccountClick} />
                      <BSRow label="GST Input Credit — IGST" amount={bs.gstInputIgst} indent
                        accountCode="1132" onAccountClick={onAccountClick} />
                    </>
                  )}
                  {bs.otherCurrentAssets > 0 && (
                    <BSRow label="Other Current Assets" amount={bs.otherCurrentAssets} indent
                      accountCode="1160" onAccountClick={onAccountClick} />
                  )}
                  <BSSubtotal label="Total Current Assets" amount={bs.totalCurrentAssets} />

                  <div className="border-t-2 border-border mt-2 pt-2">
                    <BSRow label="Total Assets" amount={bs.totalAssets} bold />
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
