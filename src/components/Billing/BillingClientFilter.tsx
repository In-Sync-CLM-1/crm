import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrencyINR } from "@/utils/billingUtils";
import type { BillingDocument } from "@/types/billing";

const ALL = "__all__";

/** Client names that appear on billing documents, sorted, without blanks or repeats. */
export function billingClientNames(documents: BillingDocument[]): string[] {
  const names = new Set<string>();
  documents.forEach(d => {
    const n = (d.client_name || "").trim();
    if (n) names.add(n);
  });
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

/** Documents for one client ("" = every client). */
export function filterByClient(documents: BillingDocument[], client: string): BillingDocument[] {
  if (!client) return documents;
  return documents.filter(d => (d.client_name || "").trim() === client);
}

interface ClientSelectProps {
  clients: string[];
  value: string;
  onChange: (client: string) => void;
}

export function BillingClientSelect({ clients, value, onChange }: ClientSelectProps) {
  // A client chosen earlier (e.g. from a shared link) that no longer has bills still shows.
  const options = value && !clients.includes(value) ? [value, ...clients] : clients;
  return (
    <Select value={value || ALL} onValueChange={v => onChange(v === ALL ? "" : v)}>
      <SelectTrigger className="w-full sm:w-[260px]" aria-label="Client" data-testid="billing-client-filter">
        <SelectValue placeholder="All clients" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All clients</SelectItem>
        {options.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export interface BillingTotals {
  billed: number;
  received: number;
  due: number;
  drafts: number;
  dueWithDrafts: number;
  draftCount: number;
}

const DUE_STATUSES = ["sent", "partially_paid", "overdue"];
// Not money owed or billed: replaced by a tax invoice, cancelled, or reversed by a credit note.
const NOT_BILLED = ["draft", "cancelled", "converted", "credited", "rejected", "expired"];

export function computeBillingTotals(documents: BillingDocument[]): BillingTotals {
  let billed = 0, received = 0, due = 0, drafts = 0, draftCount = 0;
  documents.forEach(d => {
    if (d.status === "draft") {
      drafts += d.balance_due ?? d.total_amount ?? 0;
      draftCount += 1;
      return;
    }
    if (NOT_BILLED.includes(d.status)) return;
    billed += d.total_amount || 0;
    received += d.amount_paid || 0;
    if (DUE_STATUSES.includes(d.status)) due += d.balance_due || 0;
  });
  return { billed, received, due, drafts, dueWithDrafts: due + drafts, draftCount };
}

interface TotalsStripProps {
  documents: BillingDocument[];
  /** Credit notes are not money owed, so they show only their own totals. */
  creditNotes?: boolean;
}

export function BillingTotalsStrip({ documents, creditNotes }: TotalsStripProps) {
  const t = computeBillingTotals(documents);
  const items = creditNotes
    ? [
        { label: "Issued", value: t.billed, cls: "text-foreground" },
        { label: `Drafts (${t.draftCount})`, value: t.drafts, cls: "text-muted-foreground" },
      ]
    : [
        { label: "Billed", value: t.billed, cls: "text-foreground" },
        { label: "Received", value: t.received, cls: "text-emerald-600" },
        { label: "Due (sent bills)", value: t.due, cls: "text-amber-600" },
        { label: `Drafts (${t.draftCount})`, value: t.drafts, cls: "text-muted-foreground" },
        { label: "Due incl. drafts", value: t.dueWithDrafts, cls: "text-red-600" },
      ];
  return (
    <div
      className={`grid gap-px bg-border rounded-lg overflow-hidden border grid-cols-2 ${creditNotes ? "sm:grid-cols-2" : "sm:grid-cols-5"}`}
      data-testid="billing-totals"
    >
      {items.map(i => (
        <div key={i.label} className="bg-card px-4 py-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{i.label}</p>
          <p className={`text-lg font-bold mt-0.5 ${i.cls}`}>{formatCurrencyINR(i.value)}</p>
        </div>
      ))}
    </div>
  );
}
