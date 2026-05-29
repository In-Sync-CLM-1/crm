-- Add actual_payment_received column to track actual payment received (may differ from net receivable)
ALTER TABLE public.client_invoices 
ADD COLUMN IF NOT EXISTS actual_payment_received numeric DEFAULT NULL;