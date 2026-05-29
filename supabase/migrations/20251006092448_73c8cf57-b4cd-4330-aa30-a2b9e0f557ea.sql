-- Create storage bucket for organization logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('org-logos', 'org-logos', true);

-- Allow authenticated users to upload logos for their organization
CREATE POLICY "Users can upload org logos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'org-logos' 
  AND auth.role() = 'authenticated'
);

-- Allow anyone to view logos (public bucket)
CREATE POLICY "Logos are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'org-logos');

-- Allow users to update their org logos
CREATE POLICY "Users can update org logos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'org-logos' 
  AND auth.role() = 'authenticated'
);

-- Allow users to delete their org logos
CREATE POLICY "Users can delete org logos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'org-logos' 
  AND auth.role() = 'authenticated'
);