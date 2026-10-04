-- Inward payments are only ever NEFT or UPI. Add 'neft' (legacy values stay
-- valid for historical rows) and relabel Prosync's recorded receipts.
ALTER TABLE public.billing_payments DROP CONSTRAINT IF EXISTS billing_payments_payment_mode_check;
ALTER TABLE public.billing_payments ADD CONSTRAINT billing_payments_payment_mode_check
  CHECK (payment_mode IN ('bank_transfer','neft','upi','cheque','cash','online','advance'));

UPDATE public.billing_payments p SET payment_mode = 'neft'
  FROM public.billing_documents d
 WHERE d.id = p.document_id AND p.payment_mode = 'bank_transfer'
   AND d.seller_snapshot->>'company_name' ILIKE '%PROSYNC%';
