import { useState } from "react";
import { CheckCircle, ChevronRight, Info, RefreshCw, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAccountingData } from "@/hooks/useAccountingData";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { BankTransaction, ChartOfAccount } from "@/types/accounting";
import { format } from "date-fns";

function AccountPicker({
  accounts,
  value,
  onChange,
}: {
  accounts: ChartOfAccount[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = accounts.find(a => a.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start text-left font-normal h-9">
          {selected ? (
            <span>{selected.code} — {selected.name}</span>
          ) : (
            <span className="text-muted-foreground">Select account…</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search accounts…" />
          <CommandList>
            <CommandEmpty>No accounts found.</CommandEmpty>
            {["income","asset","liability","equity","expense"].map(type => {
              const group = accounts.filter(a => a.type === type);
              if (group.length === 0) return null;
              return (
                <CommandGroup key={type} heading={type.charAt(0).toUpperCase() + type.slice(1)}>
                  {group.map(a => (
                    <CommandItem
                      key={a.id}
                      value={`${a.code} ${a.name}`}
                      onSelect={() => { onChange(a.id); setOpen(false); }}
                    >
                      <span className="text-xs text-muted-foreground w-10 shrink-0">{a.code}</span>
                      {a.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function TransactionCard({
  txn,
  accounts,
  bankAccountId,
  onDone,
}: {
  txn: BankTransaction;
  accounts: ChartOfAccount[];
  bankAccountId: string;
  onDone: () => void;
}) {
  const { categorize, settleDirectorDrawings, accountByCode } = useAccountingData();
  const { toast } = useToast();
  const [contraAccountId, setContraAccountId] = useState("");
  const [narration, setNarration] = useState(txn.narration);
  const [saving, setSaving] = useState(false);

  const isDirectorExpense = txn.auto_rule === "director_expense";
  const amount = txn.credit > 0 ? txn.credit : txn.debit;
  const isCredit = txn.credit > 0;
  const [tdsAmount, setTdsAmount] = useState(0);

  const dueToDirectorAccount = accountByCode("2241");
  // For director expenses: show only expense accounts; for company bank: show all
  const pickerAccounts = isDirectorExpense
    ? accounts.filter(a => a.type === "expense")
    : accounts;

  async function handleDirectorExpense() {
    if (!contraAccountId) {
      toast({ title: "Select an expense category first", variant: "destructive" });
      return;
    }
    if (!dueToDirectorAccount) {
      toast({ title: "Due to Director account not found", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await categorize.mutateAsync({
        bank_transaction_id: txn.id,
        entry_date: txn.transaction_date,
        narration,
        source: "manual",
        lines: [
          { account_id: contraAccountId,          debit: amount, credit: 0      },
          { account_id: dueToDirectorAccount.id,  debit: 0,      credit: amount },
        ],
      });
      // Auto-settle against any director drawings sitting in suspense
      await settleDirectorDrawings.mutateAsync();
      onDone();
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(invoiceId?: string) {
    if (!contraAccountId) {
      toast({ title: "Select an account first", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const lines = isCredit
        ? [
            { account_id: bankAccountId,    debit: amount, credit: 0      },
            { account_id: contraAccountId,  debit: 0,      credit: amount },
          ]
        : [
            { account_id: contraAccountId,  debit: amount, credit: 0      },
            { account_id: bankAccountId,    debit: 0,      credit: amount },
          ];

      await categorize.mutateAsync({
        bank_transaction_id: txn.id,
        entry_date: txn.transaction_date,
        narration,
        source: "bank_import",
        billing_document_id: invoiceId || undefined,
        lines,
      });
      onDone();
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleInvoiceMatch() {
    if (!txn.suggested_invoice_id) return;
    const trAccountId  = accountByCode("1120")?.id;
    const tdsAccountId = accountByCode("1150")?.id;
    if (!trAccountId) { toast({ title: "Trade Receivables account not found", variant: "destructive" }); return; }

    const bankAmt  = amount;
    const tdsAmt   = tdsAmount;
    const totalCleared = bankAmt + tdsAmt;

    setSaving(true);
    try {
      const lines = [
        { account_id: bankAccountId, debit: bankAmt,  credit: 0 },
        ...(tdsAmt > 0 && tdsAccountId ? [{ account_id: tdsAccountId, debit: tdsAmt, credit: 0 }] : []),
        { account_id: trAccountId,   debit: 0,         credit: totalCleared },
      ];
      await categorize.mutateAsync({
        bank_transaction_id: txn.id,
        entry_date: txn.transaction_date,
        narration: `Payment received — ${txn.suggested_invoice?.doc_number ?? ""} — ${txn.suggested_invoice?.client_name ?? ""}`,
        source: "bank_import",
        billing_document_id: txn.suggested_invoice_id,
        lines,
      });

      // Create billing_payment record to keep billing module in sync
      await supabase.from("billing_payments").insert({
        org_id: txn.org_id,
        document_id: txn.suggested_invoice_id,
        payment_date: txn.transaction_date,
        amount: bankAmt,
        tds_amount: tdsAmt,
        payment_mode: "bank_transfer",
        reference_number: txn.reference ?? null,
      });

      // Update invoice amount_paid / balance_due
      if (txn.suggested_invoice) {
        const inv = txn.suggested_invoice;
        const alreadyPaid = inv.total_amount - inv.balance_due;
        const newPaid = alreadyPaid + totalCleared;
        const newBalance = Math.max(0, inv.total_amount - newPaid);
        await supabase.from("billing_documents").update({
          amount_paid: newPaid,
          balance_due: newBalance,
          status: newBalance <= 0 ? "paid" : "partially_paid",
        }).eq("id", inv.id);
      }

      onDone();
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (isDirectorExpense) {
    return (
      <Card className="border-l-4 border-l-violet-400">
        <CardContent className="pt-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Badge variant="secondary" className="text-xs mb-1">Amit's personal account</Badge>
              <p className="text-xs text-muted-foreground">
                {format(new Date(txn.transaction_date), "dd MMM yyyy")}
                {txn.reference && <span className="ml-2">Ref: {txn.reference}</span>}
              </p>
              <p className="text-sm font-medium">{txn.narration}</p>
            </div>
            <p className="text-red-600 font-semibold text-base shrink-0">
              −₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">What was this expense for?</Label>
              <AccountPicker accounts={pickerAccounts} value={contraAccountId} onChange={setContraAccountId} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Narration</Label>
              <Input value={narration} onChange={e => setNarration(e.target.value)} className="h-8 text-sm" />
            </div>
            {contraAccountId && dueToDirectorAccount && (
              <div className="bg-muted/50 rounded-md p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Journal entry:</p>
                <p>Dr {accounts.find(a => a.id === contraAccountId)?.name} — ₹{amount.toLocaleString("en-IN")}</p>
                <p>Cr Due to Director — Amit Sengupta — ₹{amount.toLocaleString("en-IN")}</p>
              </div>
            )}
            <Button
              className="w-full"
              disabled={!contraAccountId || saving}
              onClick={handleDirectorExpense}
            >
              {saving ? "Saving…" : "Record expense"}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-l-4 border-l-amber-400">
      <CardContent className="pt-4 space-y-4">
        {/* Transaction details */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              {format(new Date(txn.transaction_date), "dd MMM yyyy")}
              {txn.reference && <span className="ml-2">Ref: {txn.reference}</span>}
            </p>
            <p className="text-sm font-medium">{txn.narration}</p>
          </div>
          <div className="text-right shrink-0">
            {isCredit ? (
              <p className="text-green-600 font-semibold text-base">
                +₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
            ) : (
              <p className="text-red-600 font-semibold text-base">
                −₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
            )}
            <Badge variant="outline" className="text-xs mt-1">
              {isCredit ? "Credit to Bank" : "Debit from Bank"}
            </Badge>
          </div>
        </div>

        {/* Invoice suggestion */}
        {txn.status === "suggested" && txn.suggested_invoice && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm text-blue-700">
              <Info className="h-4 w-4 shrink-0" />
              <span className="font-medium">Possible invoice match</span>
            </div>
            <div className="text-sm">
              <span className="font-medium">{txn.suggested_invoice.doc_number}</span>
              {" — "}{txn.suggested_invoice.client_name}
              {" — "}₹{txn.suggested_invoice.balance_due.toLocaleString("en-IN", { minimumFractionDigits: 2 })} outstanding
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-xs shrink-0">TDS deducted (₹)</Label>
              <Input
                type="number"
                placeholder="0"
                value={tdsAmount || ""}
                onChange={e => setTdsAmount(parseFloat(e.target.value) || 0)}
                className="h-7 text-sm w-28"
              />
              {tdsAmount > 0 && (
                <span className="text-xs text-blue-700">
                  Clears ₹{(amount + tdsAmount).toLocaleString("en-IN")} of AR
                </span>
              )}
            </div>
            <Button size="sm" onClick={handleInvoiceMatch} disabled={saving} className="w-full">
              <CheckCircle className="h-4 w-4 mr-2" />
              Confirm — Match to this invoice
            </Button>
          </div>
        )}

        {/* Manual categorization */}
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">What is this {isCredit ? "income" : "payment"} for?</Label>
            <AccountPicker
              accounts={accounts}
              value={contraAccountId}
              onChange={setContraAccountId}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Narration</Label>
            <Input value={narration} onChange={e => setNarration(e.target.value)} className="h-8 text-sm" />
          </div>
          <Button
            className="w-full"
            disabled={!contraAccountId || saving}
            onClick={() => handleSave()}
          >
            {saving ? "Saving…" : "Record journal entry"}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function AccountingReviewQueue() {
  const { pendingTransactions, pendingLoading, leafAccounts, accountByCode, settleDirectorDrawings, closeDirectorSalary } = useAccountingData();
  const { toast } = useToast();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [monthLabel, setMonthLabel] = useState(() => {
    const d = new Date();
    return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  });

  const bankAccount = accountByCode("1111");
  const bankAccountId = bankAccount?.id ?? "";

  async function handleSettle() {
    try {
      await settleDirectorDrawings.mutateAsync();
      toast({ title: "Settlement done", description: "Director expenses matched against drawings." });
    } catch {
      toast({ title: "Settlement failed", variant: "destructive" });
    }
  }

  async function handleCloseMonth() {
    try {
      const result = await closeDirectorSalary.mutateAsync(monthLabel);
      const amount = (result as { closed: number } | undefined)?.closed ?? 0;
      if (amount === 0) {
        toast({ title: "Nothing to close", description: "Suspense balance is zero." });
      } else {
        toast({ title: "Month closed", description: `₹${amount.toLocaleString("en-IN")} booked as Director Salary — ${monthLabel}.` });
      }
    } catch {
      toast({ title: "Close failed", variant: "destructive" });
    }
  }

  const directorPanel = (
    <Card className="border-l-4 border-l-blue-400">
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-blue-500" />
          Director Drawings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className="text-xs text-muted-foreground">
          Withdrawals are parked in suspense. Settle them against recorded expenses, then close the month to book the remainder as salary.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleSettle}
          disabled={settleDirectorDrawings.isPending}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-2 ${settleDirectorDrawings.isPending ? "animate-spin" : ""}`} />
          Settle against Director Expenses
        </Button>
        <div className="flex gap-2">
          <Input
            value={monthLabel}
            onChange={e => setMonthLabel(e.target.value)}
            className="h-8 text-sm"
            placeholder="e.g. June 2026"
          />
          <Button
            size="sm"
            className="shrink-0"
            onClick={handleCloseMonth}
            disabled={closeDirectorSalary.isPending}
          >
            {closeDirectorSalary.isPending ? "Closing…" : "Close as Salary"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  if (pendingLoading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>;
  }

  if (pendingTransactions.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
          <h3 className="text-lg font-semibold">All clear!</h3>
          <p className="text-sm text-muted-foreground mt-1">No transactions waiting for review.</p>
        </div>
        {directorPanel}
      </div>
    );
  }

  const txn = pendingTransactions[currentIdx] ?? pendingTransactions[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">{pendingTransactions.length} transactions need review</h3>
          <p className="text-sm text-muted-foreground">Reviewing {currentIdx + 1} of {pendingTransactions.length}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={currentIdx === 0} onClick={() => setCurrentIdx(i => i - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={currentIdx >= pendingTransactions.length - 1} onClick={() => setCurrentIdx(i => i + 1)}>Next</Button>
        </div>
      </div>

      {txn && (
        <TransactionCard
          key={txn.id}
          txn={txn}
          accounts={leafAccounts}
          bankAccountId={bankAccountId}
          onDone={() => setCurrentIdx(i => Math.max(0, i - 1))}
        />
      )}

      {/* Thumbnail list */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Queue</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y max-h-72 overflow-y-auto">
            {pendingTransactions.map((t, i) => (
              <button
                key={t.id}
                onClick={() => setCurrentIdx(i)}
                className={`w-full flex items-center justify-between px-4 py-2 text-left text-sm hover:bg-muted transition-colors ${i === currentIdx ? "bg-muted font-medium" : ""}`}
              >
                <span className="truncate max-w-xs">{t.narration || "—"}</span>
                <span className={t.credit > 0 ? "text-green-600 shrink-0 ml-2" : "text-red-600 shrink-0 ml-2"}>
                  {t.credit > 0 ? "+" : "−"}₹{Math.max(t.credit, t.debit).toLocaleString("en-IN")}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {directorPanel}
    </div>
  );
}
