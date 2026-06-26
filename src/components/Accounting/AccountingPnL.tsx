import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useAccountingData } from "@/hooks/useAccountingData";
import { format } from "date-fns";

function fmt(n: number, showSign = false) {
  const abs = Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2 });
  if (showSign && n < 0) return `(₹${abs})`;
  return `₹${abs}`;
}

function Section({ title, items, total, totalLabel }: {
  title: string;
  items: Array<{ label: string; amount: number }>;
  total: number;
  totalLabel: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">{title}</p>
      {items.map(item => (
        <div key={item.label} className="flex justify-between text-sm py-0.5 pl-4">
          <span>{item.label}</span>
          <span>{fmt(item.amount)}</span>
        </div>
      ))}
      <div className="flex justify-between text-sm font-semibold border-t pt-1">
        <span>{totalLabel}</span>
        <span>{fmt(total, true)}</span>
      </div>
    </div>
  );
}

function Subtotal({ label, amount, highlight = false }: { label: string; amount: number; highlight?: boolean }) {
  return (
    <div className={`flex justify-between font-semibold py-2 px-2 rounded-md ${highlight ? "bg-muted" : "border-t border-b"} text-sm`}>
      <span>{label}</span>
      <span className={amount >= 0 ? "text-green-700" : "text-red-600"}>{fmt(amount, true)}</span>
    </div>
  );
}

function exportCsv(sections: ReturnType<typeof buildSections>, fromDate: string, toDate: string) {
  const rows: string[][] = [
    [`Statement of Profit and Loss`],
    [`For the period: ${format(new Date(fromDate), "dd MMM yyyy")} to ${format(new Date(toDate), "dd MMM yyyy")}`],
    [],
    ["Particulars", "Amount (₹)"],
    ["I. Revenue from Operations", sections.revenueTotal.toFixed(2)],
    ...sections.revenueItems.map(i => [`  ${i.label}`, i.amount.toFixed(2)]),
    ["II. Other Income", sections.otherIncomeTotal.toFixed(2)],
    ...sections.otherIncomeItems.map(i => [`  ${i.label}`, i.amount.toFixed(2)]),
    ["III. Total Revenue (I + II)", sections.totalRevenue.toFixed(2)],
    ["IV. Expenses:", ""],
    ...sections.expenseItems.map(i => [`  ${i.label}`, i.amount.toFixed(2)]),
    ["V. Total Expenses", sections.totalExpenses.toFixed(2)],
    ["VI. Profit/(Loss) Before Tax", sections.pbt.toFixed(2)],
  ];
  const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = `PnL_${fromDate}_to_${toDate}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function buildSections(
  entries: ReturnType<typeof useAccountingData>["useJournalEntries"] extends (...a: unknown[]) => { data?: infer D } ? NonNullable<D> : never,
  accounts: ReturnType<typeof useAccountingData>["accounts"]
) {
  const accMap = new Map(accounts.map(a => [a.id, a]));
  const netByAccount = new Map<string, number>();

  for (const entry of entries) {
    for (const line of entry.lines ?? []) {
      const acc = accMap.get(line.account_id);
      if (!acc) continue;
      const prev = netByAccount.get(line.account_id) ?? 0;
      const delta = acc.normal_balance === "credit" ? (line.credit - line.debit) : (line.debit - line.credit);
      netByAccount.set(line.account_id, prev + delta);
    }
  }

  function sumType(types: string[], subTypes?: string[]) {
    const items: Array<{ label: string; amount: number }> = [];
    for (const [id, net] of netByAccount.entries()) {
      const acc = accMap.get(id);
      if (!acc) continue;
      if (!types.includes(acc.type)) continue;
      if (subTypes && !subTypes.includes(acc.sub_type)) continue;
      if (accounts.some(a => a.parent_code === acc.code)) continue; // skip parents
      if (net === 0) continue;
      items.push({ label: acc.name, amount: net });
    }
    items.sort((a, b) => a.label.localeCompare(b.label));
    return items;
  }

  const revenueItems         = sumType(["income"], ["operating_revenue"]);
  const otherIncomeItems     = sumType(["income"], ["other_income"]);
  const employeeItems        = sumType(["expense"], ["employee_benefits", "salaries"]);
  const financeItems         = sumType(["expense"], ["finance_cost", "interest_expense", "bank_charges"]);
  const depreciationItems    = sumType(["expense"], ["depreciation", "amortisation", "amortization"]);
  // Other expenses = all expense accounts not in the above sub_types
  const scheduledSubTypes    = new Set(["employee_benefits", "salaries", "finance_cost", "interest_expense", "bank_charges", "depreciation", "amortisation", "amortization"]);
  const otherExpenseItems    = sumType(["expense"]).filter(i => {
    const acc = [...accMap.values()].find(a => a.name === i.label);
    return acc ? !scheduledSubTypes.has(acc.sub_type) : true;
  });

  const revenueTotal         = revenueItems.reduce((s, i) => s + i.amount, 0);
  const otherIncomeTotal     = otherIncomeItems.reduce((s, i) => s + i.amount, 0);
  const totalRevenue         = revenueTotal + otherIncomeTotal;
  const totalEmployeeCost    = employeeItems.reduce((s, i) => s + i.amount, 0);
  const totalFinanceCost     = financeItems.reduce((s, i) => s + i.amount, 0);
  const totalDepreciation    = depreciationItems.reduce((s, i) => s + i.amount, 0);
  const totalOtherExpenses   = otherExpenseItems.reduce((s, i) => s + i.amount, 0);
  const totalExpenses        = totalEmployeeCost + totalFinanceCost + totalDepreciation + totalOtherExpenses;
  const pbt                  = totalRevenue - totalExpenses;

  // Keep expenseItems as flat list for CSV export back-compat
  const expenseItems = [...employeeItems, ...financeItems, ...depreciationItems, ...otherExpenseItems];

  return {
    revenueItems, otherIncomeItems, expenseItems,
    employeeItems, financeItems, depreciationItems, otherExpenseItems,
    revenueTotal, otherIncomeTotal, totalRevenue,
    totalEmployeeCost, totalFinanceCost, totalDepreciation, totalOtherExpenses,
    totalExpenses, pbt,
  };
}

export function AccountingPnL({ fromDate, toDate }: { fromDate: string; toDate: string }) {
  const { accounts, accountsLoading, useJournalEntries } = useAccountingData();
  const { data: entries = [], isLoading: entriesLoading } = useJournalEntries(fromDate, toDate);

  const sections = useMemo(() => {
    if (!entries.length || !accounts.length) return null;
    return buildSections(entries as Parameters<typeof buildSections>[0], accounts);
  }, [entries, accounts]);

  const loading = accountsLoading || entriesLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          For the period: {format(new Date(fromDate), "dd MMMM yyyy")} to {format(new Date(toDate), "dd MMMM yyyy")}
        </p>
        {sections && (
          <Button variant="outline" size="sm" onClick={() => exportCsv(sections, fromDate, toDate)}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="py-4 px-6 space-y-3">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && !sections && <p className="text-sm text-muted-foreground">No journal entries in this period.</p>}
          {sections && (
            <>
              <div className="text-center pb-2 border-b">
                <p className="font-bold text-base">Prosync AI Solutions</p>
                <p className="text-sm text-muted-foreground">Statement of Profit and Loss</p>
                <p className="text-xs text-muted-foreground">
                  For the year ended / period ending {format(new Date(toDate), "dd MMMM yyyy")}
                </p>
              </div>

              <Section
                title="I. Revenue from Operations"
                items={sections.revenueItems}
                total={sections.revenueTotal}
                totalLabel="Total Revenue from Operations"
              />
              <Section
                title="II. Other Income"
                items={sections.otherIncomeItems}
                total={sections.otherIncomeTotal}
                totalLabel="Total Other Income"
              />
              <Subtotal label="III. Total Revenue (I + II)" amount={sections.totalRevenue} />

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">IV. Expenses</p>

                {sections.employeeItems.length > 0 && (
                  <>
                    <p className="text-xs text-muted-foreground pl-4 mt-1">(a) Employee Benefits Expense</p>
                    {sections.employeeItems.map(item => (
                      <div key={item.label} className="flex justify-between text-sm py-0.5 pl-8">
                        <span>{item.label}</span>
                        <span>{fmt(item.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs text-muted-foreground pl-4 border-t border-dashed pt-0.5">
                      <span>Total Employee Benefits</span>
                      <span>{fmt(sections.totalEmployeeCost)}</span>
                    </div>
                  </>
                )}

                {sections.financeItems.length > 0 && (
                  <>
                    <p className="text-xs text-muted-foreground pl-4 mt-2">(b) Finance Costs</p>
                    {sections.financeItems.map(item => (
                      <div key={item.label} className="flex justify-between text-sm py-0.5 pl-8">
                        <span>{item.label}</span>
                        <span>{fmt(item.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs text-muted-foreground pl-4 border-t border-dashed pt-0.5">
                      <span>Total Finance Costs</span>
                      <span>{fmt(sections.totalFinanceCost)}</span>
                    </div>
                  </>
                )}

                {sections.depreciationItems.length > 0 && (
                  <>
                    <p className="text-xs text-muted-foreground pl-4 mt-2">(c) Depreciation &amp; Amortisation</p>
                    {sections.depreciationItems.map(item => (
                      <div key={item.label} className="flex justify-between text-sm py-0.5 pl-8">
                        <span>{item.label}</span>
                        <span>{fmt(item.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs text-muted-foreground pl-4 border-t border-dashed pt-0.5">
                      <span>Total Depreciation</span>
                      <span>{fmt(sections.totalDepreciation)}</span>
                    </div>
                  </>
                )}

                {sections.otherExpenseItems.length > 0 && (
                  <>
                    <p className="text-xs text-muted-foreground pl-4 mt-2">{sections.employeeItems.length || sections.financeItems.length || sections.depreciationItems.length ? "(d) Other Expenses" : "(a) Other Expenses"}</p>
                    {sections.otherExpenseItems.map(item => (
                      <div key={item.label} className="flex justify-between text-sm py-0.5 pl-8">
                        <span>{item.label}</span>
                        <span>{fmt(item.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs text-muted-foreground pl-4 border-t border-dashed pt-0.5">
                      <span>Total Other Expenses</span>
                      <span>{fmt(sections.totalOtherExpenses)}</span>
                    </div>
                  </>
                )}

                <div className="flex justify-between text-sm font-semibold border-t pt-1 mt-2">
                  <span>V. Total Expenses</span>
                  <span>{fmt(sections.totalExpenses)}</span>
                </div>
              </div>

              <Subtotal
                label="VI. Profit / (Loss) Before Tax"
                amount={sections.pbt}
                highlight
              />

              <div className="flex justify-between text-sm pl-4 py-0.5 text-muted-foreground">
                <span>VII. Tax Expense</span>
                <span>—</span>
              </div>

              <Subtotal
                label="VIII. Profit / (Loss) for the Period"
                amount={sections.pbt}
                highlight
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
