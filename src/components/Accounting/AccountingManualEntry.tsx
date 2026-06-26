import { useState, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Receipt, Plus, Paperclip, X, ExternalLink } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAccountingData } from "@/hooks/useAccountingData";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
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
  const { effectiveOrgId } = useOrgContext();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dueToDirectorAccount = accountByCode("2241");

  const [date,       setDate]       = useState(format(new Date(), "yyyy-MM-dd"));
  const [desc,       setDesc]       = useState("");
  const [expAccId,   setExpAccId]   = useState("");
  const [amount,     setAmount]     = useState("");
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [saving,     setSaving]     = useState(false);

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

  async function uploadInvoice(entryId: string): Promise<string | null> {
    if (!invoiceFile) return null;
    const form = new FormData();
    form.append("file", invoiceFile);
    form.append("journal_entry_id", entryId);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await supabase.functions.invoke("upload-invoice", {
      body: form,
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    if (res.error) {
      toast({ title: "Invoice upload failed", description: res.error.message, variant: "destructive" });
      return null;
    }
    return (res.data as { url: string })?.url ?? null;
  }

  async function handleSave() {
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
      // Create the journal entry first (without invoice_url)
      const je = await categorize.mutateAsync({
        entry_date: date,
        narration: desc,
        source: "manual",
        lines: [
          { account_id: expAccId,                debit: amt, credit: 0   },
          { account_id: dueToDirectorAccount.id, debit: 0,   credit: amt },
        ],
      });

      // Upload invoice to R2 + AI-parse metadata (edge function updates journal_entry directly)
      if (invoiceFile && je?.id) {
        await uploadInvoice(je.id);
      }

      setDesc(""); setAmount(""); setExpAccId(""); setInvoiceFile(null);
      toast({
        title: "Entry recorded",
        description: `₹${amt.toLocaleString("en-IN")} added to Due to Director balance.`,
      });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const selectedExpAccount = leafAccounts.find(a => a.id === expAccId);

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

      {/* Expense entry */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Expense paid by Amit Sengupta
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
            <Label className="text-xs">Description</Label>
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

          {/* Invoice attachment */}
          <div className="space-y-1">
            <Label className="text-xs">Invoice (optional — PDF, JPG, PNG)</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={e => setInvoiceFile(e.target.files?.[0] ?? null)}
            />
            {invoiceFile ? (
              <div className="flex items-center gap-2 h-9 px-3 border border-input rounded-md text-sm bg-background">
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate flex-1">{invoiceFile.name}</span>
                <button
                  type="button"
                  onClick={() => { setInvoiceFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full h-9 justify-start text-muted-foreground font-normal"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-3.5 w-3.5 mr-2" />
                Attach invoice…
              </Button>
            )}
          </div>

          <div className="bg-muted/50 rounded-md p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Journal entry that will be created:</p>
            <p>Dr {selectedExpAccount?.name ?? "[Expense account]"} — ₹{amount || "0"}</p>
            <p>Cr Due to Director — Amit Sengupta — ₹{amount || "0"}</p>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            {saving ? "Saving…" : "Record entry"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
