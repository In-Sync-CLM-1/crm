-- First, delete duplicate invoices keeping the oldest one
DELETE FROM client_invoices 
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY org_id, invoice_number ORDER BY created_at) as rn
    FROM client_invoices
  ) t WHERE rn > 1
);

-- Add unique constraint to prevent duplicate invoice numbers per organization
ALTER TABLE public.client_invoices 
ADD CONSTRAINT client_invoices_org_invoice_unique 
UNIQUE (org_id, invoice_number);