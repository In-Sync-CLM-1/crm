-- Add AI-parsed invoice metadata columns to journal_entries
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS invoice_party       text,
  ADD COLUMN IF NOT EXISTS invoice_date        text,
  ADD COLUMN IF NOT EXISTS invoice_description text,
  ADD COLUMN IF NOT EXISTS invoice_amount      numeric(15,2);
