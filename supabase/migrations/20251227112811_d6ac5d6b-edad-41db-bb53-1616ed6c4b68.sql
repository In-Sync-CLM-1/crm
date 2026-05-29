-- Add document_type column to distinguish between quotations and invoices
ALTER TABLE public.client_invoices 
ADD COLUMN IF NOT EXISTS document_type text DEFAULT 'invoice' CHECK (document_type IN ('quotation', 'invoice'));

-- Add converted_from_quotation_id to track quotation to invoice conversions
ALTER TABLE public.client_invoices 
ADD COLUMN IF NOT EXISTS converted_from_quotation_id uuid REFERENCES public.client_invoices(id);

-- Migrate existing data based on invoice_number prefix
UPDATE public.client_invoices 
SET document_type = 'quotation' 
WHERE invoice_number LIKE 'QT-%' AND document_type IS NULL;

UPDATE public.client_invoices 
SET document_type = 'invoice' 
WHERE invoice_number LIKE 'INV-%' AND document_type IS NULL;

-- Set default for any remaining records without document_type
UPDATE public.client_invoices 
SET document_type = 'invoice' 
WHERE document_type IS NULL;

-- Create index for faster filtering by document_type
CREATE INDEX IF NOT EXISTS idx_client_invoices_document_type ON public.client_invoices(document_type);