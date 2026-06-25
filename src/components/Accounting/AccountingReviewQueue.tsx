import { useState } from "react";
import { CheckCircle, ChevronRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAccountingData } from "@/hooks/useAccountingData";
import { useToast } from "@/hooks/use-toast";
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
  const { categorize, accountByCode } = useAccountingData();
  const { toast } = useToast();
  const [contraAccountId, setContraAccountId] = useState("");
  const [narration, setNarration] = useState(txn.narration);
  const [saving, setSaving] = useState(false);

  const amount = txn.credit > 0 ? txn.credit : txn.debit;
  const isCredit = txn.credit > 0;

  async function handleSave(invoiceId?: string) {
    if (!contraAccountId) {
      toast({ title: "Select an account first", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // Bank credit: Debit Bank, Credit contra
      // Bank debit:  Debit contra, Credit Bank
      const lines = isCredit
        ? [
            { account_id: bankAccountId, debit: amount, credit: 0 },
            { account_id: contraAccountId, debit: 0, credit: amount },
          ]
        : [
            { account_id: contraAccountId, debit: amount, credit: 0 },
            { account_id: bankAccountId, debit: 0, credit: amount },
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
    const trAccountId = accountByCode("1120")?.id;
    if (!trAccountId) { toast({ title: "Trade Receivables account not found", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const lines = [
        { account_id: bankAccountId, debit: amount, credit: 0 },
        { account_id: trAccountId, debit: 0, credit: amount },
      ];
      await categorize.mutateAsync({
        bank_transaction_id: txn.id,
        entry_date: txn.transaction_date,
        narration: `Payment received — ${txn.suggested_invoice?.doc_number ?? ""} — ${txn.suggested_invoice?.client_name ?? ""}`,
        source: "bank_import",
        billing_document_id: txn.suggested_invoice_id,
        lines,
      });
      onDone();
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
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
  const { pendingTransactions, pendingLoading, leafAccounts, accountByCode } = useAccountingData();
  const [currentIdx, setCurrentIdx] = useState(0);

  const bankAccount = accountByCode("1111");
  const bankAccountId = bankAccount?.id ?? "";

  if (pendingLoading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>;
  }

  if (pendingTransactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
        <h3 className="text-lg font-semibold">All clear!</h3>
        <p className="text-sm text-muted-foreground mt-1">No transactions waiting for review.</p>
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
    </div>
  );
}
