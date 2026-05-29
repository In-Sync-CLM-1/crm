-- Add tax_amount column to client_invoices
ALTER TABLE public.client_invoices 
ADD COLUMN IF NOT EXISTS tax_amount numeric DEFAULT 0;