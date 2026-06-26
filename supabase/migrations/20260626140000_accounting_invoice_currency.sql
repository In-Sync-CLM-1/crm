-- Track the original invoice currency so we know which amounts were converted
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS invoice_currency text;
