-- Add payment and tax tracking columns to client_invoices
ALTER TABLE public.client_invoices 
ADD COLUMN IF NOT EXISTS payment_received_date date,
ADD COLUMN IF NOT EXISTS gst_rate numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS tds_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS net_received_amount numeric DEFAULT 0;