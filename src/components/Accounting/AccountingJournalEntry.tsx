import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, BookOpen } from "lucide-react";
import { AccountPicker } from "./AccountPicker";
import { useAccountingData } from "@/hooks/useAccountingData";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface JournalLine {
  key: string;
  account_id: string;
  debit: string;
  credit: string;
}

function newLine(): JournalLine {
  return { key: crypto.randomUUID(), account_id: "", debit: "", credit: "" };
}

export function AccountingJournalEntry() {
  const { leafAccounts, categorize } = useAccountingData();
  const { toast } = useToast();

  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [narration, setNarration] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<JournalLine[]>([newLine(), newLine()]);
  const [saving, setSaving] = useState(false);

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  function updateLine(key: string, field: keyof JournalLine, value: string) {
    setLines(ls => ls.map(l => l.key === key ? { ...l, [field]: value } : l));
  }

  function removeLine(key: string) {
    if (lines.length <= 2) return;
    setLines(ls => ls.filter(l => l.key !== key));
  }

  async function handleSave() {
    if (!narration.trim()) {
      toast({ title: "Enter a narration / description", variant: "destructive" });
      return;
    }
    if (!isBalanced) {
      toast({ title: "Debits and credits must be equal", variant: "destructive" });
      return;
    }
    const validLines = lines.filter(l => l.account_id && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0));
    if (validLines.length < 2) {
      toast({ title: "Select accounts for at least 2 lines", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await categorize.mutateAsync({
        entry_date: date,
        narration: narration.trim(),
        reference: reference.trim() || undefined,
        source: "manual",
        lines: validLines.map(l => ({
          account_id: l.account_id,
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0,
        })),
      });
      setNarration("");
      setReference("");
      setLines([newLine(), newLine()]);
      toast({ title: "Journal entry posted" });
    } catch {
      toast({ title: "Failed to save entry", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            New Journal Entry
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
              <Label className="text-xs">Reference (optional)</Label>
              <Input placeholder="e.g. INV-001" value={reference}
                onChange={e => setReference(e.target.value)} className="h-9" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Narration</Label>
            <Input placeholder="Description of this transaction"
              value={narration} onChange={e => setNarration(e.target.value)} className="h-9" />
          </div>

          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs">
                <tr>
                  <th className="px-3 py-2 text-left">Account</th>
                  <th className="px-3 py-2 text-right w-[22%]">Debit (₹)</th>
                  <th className="px-3 py-2 text-right w-[22%]">Credit (₹)</th>
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
                      <Input
                        type="number" placeholder="0.00"
                        value={line.debit}
                        onChange={e => {
                          updateLine(line.key, "debit", e.target.value);
                          if (e.target.value) updateLine(line.key, "credit", "");
                        }}
                        className="h-8 text-right"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="number" placeholder="0.00"
                        value={line.credit}
                        onChange={e => {
                          updateLine(line.key, "credit", e.target.value);
                          if (e.target.value) updateLine(line.key, "debit", "");
                        }}
                        className="h-8 text-right"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => removeLine(line.key)}
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
                    {totalDebit > 0
                      ? `₹${totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {totalCredit > 0
                      ? `₹${totalCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                      : "—"}
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
              onClick={() => setLines(ls => [...ls, newLine()])}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Add line
            </Button>
            {!isBalanced && totalDebit > 0 && (
              <span className="text-xs text-red-500 ml-auto">
                Difference: ₹{Math.abs(totalDebit - totalCredit).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            )}
            <Button
              onClick={handleSave}
              disabled={saving || !isBalanced || !narration.trim()}
              className={isBalanced && totalDebit > 0 ? "" : "ml-auto"}
            >
              {saving ? "Posting…" : "Post entry"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
