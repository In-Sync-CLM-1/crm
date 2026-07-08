import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { formatCurrencyINR } from "@/utils/billingUtils";
import type { BillingPayment, BillingDocument } from "@/types/billing";
import { EditPaymentDialog } from "./EditPaymentDialog";

interface BillingPaymentsListProps {
  payments: BillingPayment[];
  documents: BillingDocument[];
  onUpdatePayment?: (paymentId: string, updates: { tds_amount?: number; payment_mode?: string; reference_number?: string; notes?: string }) => void;
}

export function BillingPaymentsList({ payments, documents, onUpdatePayment }: BillingPaymentsListProps) {
  const [editingPayment, setEditingPayment] = useState<BillingPayment | null>(null);
  const enriched = payments.map(p => {
    const doc = documents.find(d => d.id === p.document_id);
    return { ...p, doc_number: doc?.doc_number || "—", client_name: doc?.client_name || "—" };
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Payments</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{payments.length} payments recorded</p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Invoice #</TableHead>
              <TableHead>Client</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">TDS</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Reference</TableHead>
              {onUpdatePayment && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {enriched.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No payments recorded yet. Record payments from Tax Invoice views.</TableCell></TableRow>
            ) : (
              enriched.map(p => (
                <TableRow key={p.id}>
                  <TableCell>{p.payment_date}</TableCell>
                  <TableCell className="font-semibold text-primary">{p.doc_number}</TableCell>
                  <TableCell>{p.client_name}</TableCell>
                  <TableCell className="text-right font-bold text-emerald-600">{formatCurrencyINR(p.amount)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{p.tds_amount ? formatCurrencyINR(p.tds_amount) : "—"}</TableCell>
                  <TableCell className="capitalize">{p.payment_mode?.replace(/_/g, " ")}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{p.reference_number || "—"}</TableCell>
                  {onUpdatePayment && (
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-auto p-1" onClick={() => setEditingPayment(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {onUpdatePayment && (
        <EditPaymentDialog
          open={!!editingPayment}
          onClose={() => setEditingPayment(null)}
          payment={editingPayment}
          onSave={onUpdatePayment}
        />
      )}
    </div>
  );
}
