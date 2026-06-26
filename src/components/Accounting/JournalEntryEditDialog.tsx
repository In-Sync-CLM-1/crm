import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { AccountPicker } from "./AccountPicker";
import { useAccountingData } from "@/hooks/useAccountingData";
import { useToast } from "@/hooks/use-toast";
import type { JournalEntry, ChartOfAccount } from "@/types/accounting";

interface EditLine {
  key: string;
  account_id: string;
  debit: string;
  credit: string;
}

const SOURCE_LABEL: Record<string, string> = {
  bank_import: "Bank Import",
  manual: "Manual",
  system_interest: "System",
  director_settlement: "Settlement",
  director_salary: "Salary",
  invoice: "Invoice",
  credit_note: "Credit Note",
};

export function JournalEntryEditDialog({
  entry,
  accounts,
  open,
  onClose,
}: {
  entry: JournalEntry | null;
  accounts: ChartOfAccount[];
  open: boolean;
  onClose: () => void;
}) {
  const { updateJournalEntry } = useAccountingData();
  const { toast } = useToast();

  const [date, setDate] = useState("");
  const [narration, setNarration] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<EditLine[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setDate(entry.entry_date);
    setNarration(entry.narration);
    setReference(entry.reference ?? "");
    setLines(
      (entry.lines ?? []).map(l => ({
        key: l.id,
        account_id: l.account_id,
        debit: l.debit > 0 ? String(l.debit) : "",
        credit: l.credit > 0 ? String(l.credit) : "",
      }))
    );
  }, [entry]);

  const leafAccounts = accounts.filter(a => !accounts.some(b => b.parent_code === a.code));
  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  function updateLine(key: string, field: keyof EditLine, value: string) {
    setLines(ls => ls.map(l => l.key === key ? { ...l, [field]: value } : l));
  }

  async function handleSave() {
    if (!entry || !isBalanced) return;
    const validLines = lines.filter(l => l.account_id);
    if (validLines.length < 2) {
      toast({ title: "Need at least 2 account lines", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await updateJournalEntry.mutateAsync({
        id: entry.id,
        entry_date: date,
        narration,
        reference: reference || undefined,
        lines: validLines.map(l => ({
          account_id: l.account_id,
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0,
        })),
      });
      toast({ title: "Entry updated" });
      onClose();
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Journal Entry
            {entry && (
              <Badge variant="secondary" className="text-xs font-normal">
                {SOURCE_LABEL[entry.source] ?? entry.source}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full h-9 px-3 border border-input rounded-md text-sm bg-background" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reference</Label>
              <Input value={reference} onChange={e => setReference(e.target.value)}
                placeholder="Optional" className="h-9" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Narration</Label>
            <Input value={narration} onChange={e => setNarration(e.target.value)} className="h-9" />
          </div>

          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs">
                <tr>
                  <th className="px-3 py-2 text-left">Account</th>
                  <th className="px-3 py-2 text-right w-32">Debit (₹)</th>
                  <th className="px-3 py-2 text-right w-32">Credit (₹)</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map(line => (
                  <tr key={line.key}>
                    <td className="px-2 py-1.5">
                      <AccountPicker
                        accounts={leafAccounts}
                        value={line.account_id}
                        onChange={id => updateLine(line.key, "account_id", id)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input type="number" placeholder="0.00" value={line.debit}
                        onChange={e => {
                          updateLine(line.key, "debit", e.target.value);
                          if (e.target.value) updateLine(line.key, "credit", "");
                        }}
                        className="h-8 text-right" />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input type="number" placeholder="0.00" value={line.credit}
                        onChange={e => {
                          updateLine(line.key, "credit", e.target.value);
                          if (e.target.value) updateLine(line.key, "debit", "");
                        }}
                        className="h-8 text-right" />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => lines.length > 2 && setLines(ls => ls.filter(l => l.key !== line.key))}
                        disabled={lines.length <= 2}
                        className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted/50 font-medium text-xs">
                  <td className="px-3 py-2 text-muted-foreground">Total</td>
                  <td className="px-3 py-2 text-right">
                    {totalDebit > 0 ? `₹${totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {totalCredit > 0 ? `₹${totalCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
                  </td>
                  <td className="px-2 py-2 text-center text-base">
                    {totalDebit > 0 && (
                      <span className={isBalanced ? "text-green-600" : "text-red-500"}>
                        {isBalanced ? "✓" : "✗"}
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="sm"
              onClick={() => setLines(ls => [...ls, { key: crypto.randomUUID(), account_id: "", debit: "", credit: "" }])}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Add line
            </Button>
            {!isBalanced && totalDebit > 0 && (
              <span className="text-xs text-red-500 ml-auto">
                Difference: ₹{Math.abs(totalDebit - totalCredit).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !isBalanced || !narration}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
