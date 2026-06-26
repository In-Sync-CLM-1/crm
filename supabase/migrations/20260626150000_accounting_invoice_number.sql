-- Store the vendor invoice number extracted by AI for deduplication
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS invoice_number text;

-- Prevent the same vendor invoice from being uploaded twice within an org
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_invoice_number_unique
  ON public.journal_entries (org_id, invoice_number)
  WHERE invoice_number IS NOT NULL;
