-- Create storage bucket for bulk import files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('import-files', 'import-files', false)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for import files
CREATE POLICY "Users can upload their own import files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'import-files' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can read their own import files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'import-files' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "System can delete import files"
ON storage.objects FOR DELETE
USING (bucket_id = 'import-files');