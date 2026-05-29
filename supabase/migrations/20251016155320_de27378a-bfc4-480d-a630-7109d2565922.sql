-- Add new columns for standard email template structure
ALTER TABLE email_templates 
ADD COLUMN body_content TEXT,
ADD COLUMN buttons JSONB DEFAULT '[]'::jsonb,
ADD COLUMN attachments JSONB DEFAULT '[]'::jsonb;

-- Make design_json nullable for backward compatibility
ALTER TABLE email_templates 
ALTER COLUMN design_json DROP NOT NULL;

-- Migrate existing templates: copy html_content to body_content
UPDATE email_templates
SET body_content = html_content
WHERE body_content IS NULL;

-- Add comments for clarity
COMMENT ON COLUMN email_templates.design_json IS 'Deprecated - kept for backward compatibility with Unlayer templates';
COMMENT ON COLUMN email_templates.body_content IS 'Main email body content with variables';
COMMENT ON COLUMN email_templates.buttons IS 'Array of CTA button objects';
COMMENT ON COLUMN email_templates.attachments IS 'Array of image/video attachment objects';

-- Create email attachments storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'email-attachments',
  'email-attachments',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for email attachments bucket
CREATE POLICY "Users can upload email attachments in their org"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'email-attachments' AND
  (storage.foldername(name))[1] = (SELECT org_id::text FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Users can view email attachments in their org"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'email-attachments' AND
  (storage.foldername(name))[1] = (SELECT org_id::text FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Users can delete email attachments in their org"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'email-attachments' AND
  (storage.foldername(name))[1] = (SELECT org_id::text FROM profiles WHERE id = auth.uid())
);