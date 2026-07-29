-- A credit note issued against an invoice needs to be able to mark that
-- invoice as fully settled without pretending real cash was received —
-- "paid" already means that and drives the Total Revenue figure. Add a
-- distinct "credited" status for invoices whose balance is written off by
-- a credit note rather than collected.
ALTER TABLE public.billing_documents
  DROP CONSTRAINT IF EXISTS billing_documents_status_check;
ALTER TABLE public.billing_documents
  ADD CONSTRAINT billing_documents_status_check
    CHECK (status = ANY (ARRAY[
      'draft'::text, 'sent'::text, 'paid'::text, 'partially_paid'::text,
      'overdue'::text, 'cancelled'::text, 'accepted'::text, 'rejected'::text,
      'expired'::text, 'issued'::text, 'converted'::text, 'credited'::text
    ]));
