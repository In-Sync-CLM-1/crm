import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Plus } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAccountingData } from "@/hooks/useAccountingData";
import { useToast } from "@/hooks/use-toast";
import type { ChartOfAccount } from "@/types/accounting";
import { format } from "date-fns";

function AccountPicker({ accounts, value, onChange, placeholder }: {
  accounts: ChartOfAccount[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = accounts.find(a => a.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start text-left font-normal h-9">
          {selected
            ? <span>{selected.code} — {selected.name}</span>
            : <span className="text-muted-foreground">{placeholder ?? "Select account…"}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandList>
            <CommandEmpty>No accounts found.</CommandEmpty>
            {["expense","asset","liability","income","equity"].map(type => {
              const group = accounts.filter(a => a.type === type);
              if (!group.length) return null;
              return (
                <CommandGroup key={type} heading={type.charAt(0).toUpperCase() + type.slice(1)}>
                  {group.map(a => (
                    <CommandItem key={a.id} value={`${a.code} ${a.name}`}
                      onSelect={() => { onChange(a.id); setOpen(false); }}>
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

export function AccountingManualEntry() {
  const { leafAccounts, accountByCode, categorize, useJournalEntries } = useAccountingData();
  const { toast } = useToast();

  const dueToDirectorAccount = accountByCode("2241");

  // Card expense form state
  const [date,       setDate]       = useState(format(new Date(), "yyyy-MM-dd"));
  const [desc,       setDesc]       = useState("");
  const [expAccId,   setExpAccId]   = useState("");
  const [amount,     setAmount]     = useState("");
  const [saving,     setSaving]     = useState(false);

  // Outstanding Due to Director balance
  const { data: entries = [] } = useJournalEntries();
  const dueBalance = useMemo(() => {
    if (!dueToDirectorAccount) return 0;
    let bal = 0;
    for (const e of entries) {
      for (const l of e.lines ?? []) {
        if (l.account_id === dueToDirectorAccount.id) bal += (l.credit - l.debit);
      }
    }
    return bal;
  }, [entries, dueToDirectorAccount]);

  const expenseAccounts = leafAccounts.filter(a => a.type === "expense");

  async function handleCardExpense() {
    if (!expAccId || !amount || !desc) {
      toast({ title: "Fill in all fields", variant: "destructive" });
      return;
    }
    if (!dueToDirectorAccount) {
      toast({ title: "Due to Director account not found", variant: "destructive" });
      return;
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await categorize.mutateAsync({
        bank_transaction_id: "__manual__" as string,
        entry_date: date,
        narration: desc,
        source: "manual",
        lines: [
          { account_id: expAccId,                debit: amt, credit: 0   },
          { account_id: dueToDirectorAccount.id, debit: 0,   credit: amt },
        ],
      });
      setDesc(""); setAmount(""); setExpAccId("");
      toast({ title: "Entry recorded", description: `₹${amt.toLocaleString("en-IN")} added to Due to Director balance.` });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      {/* Outstanding balance */}
      <Card className={dueBalance > 0 ? "border-amber-300 bg-amber-50" : ""}>
        <CardContent className="pt-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Due to Director — Amit Sengupta</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Settled automatically when next transfer to Amit is imported
            </p>
          </div>
          <Badge variant={dueBalance > 0 ? "destructive" : "secondary"} className="text-sm px-3 py-1">
            ₹{dueBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </Badge>
        </CardContent>
      </Card>

      {/* Card expense entry */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Amit paid by personal card
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full h-9 px-3 border border-input rounded-md text-sm bg-background" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Amount (₹)</Label>
              <Input type="number" placeholder="0.00" value={amount}
                onChange={e => setAmount(e.target.value)} className="h-9" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">What was purchased?</Label>
            <Input placeholder="e.g. Google Workspace licence — June 2026"
              value={desc} onChange={e => setDesc(e.target.value)} className="h-9" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Expense category</Label>
            <AccountPicker
              accounts={expenseAccounts}
              value={expAccId}
              onChange={setExpAccId}
              placeholder="Select expense account…"
            />
          </div>

          <div className="bg-muted/50 rounded-md p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Journal entry that will be created:</p>
            <p>Dr {expAccId ? leafAccounts.find(a => a.id === expAccId)?.name : "[Expense account]"} — ₹{amount || "0"}</p>
            <p>Cr Due to Director — Amit Sengupta — ₹{amount || "0"}</p>
          </div>

          <Button onClick={handleCardExpense} disabled={saving} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            {saving ? "Saving…" : "Record entry"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
