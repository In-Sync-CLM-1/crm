-- Add new columns to email_bulk_campaigns for template content
ALTER TABLE email_bulk_campaigns 
ADD COLUMN body_content TEXT,
ADD COLUMN buttons JSONB DEFAULT '[]'::jsonb,
ADD COLUMN attachments JSONB DEFAULT '[]'::jsonb;

-- Migrate existing data from html_content to body_content
UPDATE email_bulk_campaigns
SET body_content = html_content
WHERE body_content IS NULL;

-- Add helpful comments
COMMENT ON COLUMN email_bulk_campaigns.body_content IS 'Main email body content with variables';
COMMENT ON COLUMN email_bulk_campaigns.buttons IS 'Array of CTA button objects';
COMMENT ON COLUMN email_bulk_campaigns.attachments IS 'Array of image/video attachment objects';