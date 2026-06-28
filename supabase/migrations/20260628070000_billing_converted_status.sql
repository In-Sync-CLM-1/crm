-- Allow 'converted' as a valid status for billing_documents.
-- A source proforma/quotation is marked 'converted' when an invoice
-- is created from it, so it is excluded from revenue and GST reports
-- without being deleted.

ALTER TABLE billing_documents
  DROP CONSTRAINT billing_documents_status_check;

ALTER TABLE billing_documents
  ADD CONSTRAINT billing_documents_status_check CHECK (
    status = ANY (ARRAY[
      'draft', 'sent', 'paid', 'partially_paid', 'overdue',
      'cancelled', 'accepted', 'rejected', 'expired', 'issued',
      'converted'
    ])
  );

-- Backfill: mark every proforma/quotation that already has an invoice
-- converted from it.
UPDATE billing_documents
SET    status = 'converted',
       updated_at = now()
WHERE  id IN (
         SELECT converted_from_id
         FROM   billing_documents
         WHERE  converted_from_id IS NOT NULL
       )
  AND  status <> 'converted';
