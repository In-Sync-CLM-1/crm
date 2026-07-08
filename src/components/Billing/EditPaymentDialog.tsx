import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check } from "lucide-react";
import { formatCurrencyINR } from "@/utils/billingUtils";
import type { BillingPayment } from "@/types/billing";

interface EditPaymentDialogProps {
  open: boolean;
  onClose: () => void;
  payment: BillingPayment | null;
  onSave: (paymentId: string, updates: { tds_amount?: number; payment_mode?: string; reference_number?: string; notes?: string }) => void;
}

export function EditPaymentDialog({ open, onClose, payment, onSave }: EditPaymentDialogProps) {
  const [form, setForm] = useState({
    tds_amount: "0",
    payment_mode: "bank_transfer",
    reference_number: "",
    notes: "",
  });

  useEffect(() => {
    if (payment) {
      setForm({
        tds_amount: String(payment.tds_amount || 0),
        payment_mode: payment.payment_mode || "bank_transfer",
        reference_number: payment.reference_number || "",
        notes: payment.notes || "",
      });
    }
  }, [payment]);

  if (!payment) return null;

  const handleSubmit = () => {
    onSave(payment.id, {
      tds_amount: parseFloat(form.tds_amount) || 0,
      payment_mode: form.payment_mode,
      reference_number: form.reference_number,
      notes: form.notes,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Payment</DialogTitle>
        </DialogHeader>

        <div className="bg-muted/50 rounded-lg p-4 mb-4 space-y-1">
          <div className="flex justify-between text-sm"><span>Payment Date</span><strong>{payment.payment_date}</strong></div>
          <div className="flex justify-between text-sm"><span>Amount Received</span><strong className="text-emerald-600">{formatCurrencyINR(payment.amount)}</strong></div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>TDS Deducted</Label>
            <Input type="number" value={form.tds_amount} onChange={e => setForm({ ...form, tds_amount: e.target.value })} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label>Payment Mode</Label>
            <Select value={form.payment_mode} onValueChange={v => setForm({ ...form, payment_mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="online">Online Gateway</SelectItem>
                <SelectItem value="advance">Advance</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Reference Number</Label>
            <Input value={form.reference_number} onChange={e => setForm({ ...form, reference_number: e.target.value })} placeholder="Transaction ID / Cheque No." />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Notes</Label>
            <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSubmit}>
            <Check className="h-4 w-4 mr-1" />Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
