-- Add invoice_url to journal_entries for attaching vendor invoices
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS invoice_url text;

-- Storage bucket for accounting invoice PDFs / images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'accounting-invoices',
  'accounting-invoices',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Any authenticated user can manage objects in this bucket
-- (solo org; org scoping is enforced by path convention in app code)
CREATE POLICY "accounting_invoices_all" ON storage.objects
  FOR ALL
  USING  (bucket_id = 'accounting-invoices' AND auth.uid() IS NOT NULL)
  WITH CHECK (bucket_id = 'accounting-invoices' AND auth.uid() IS NOT NULL);
