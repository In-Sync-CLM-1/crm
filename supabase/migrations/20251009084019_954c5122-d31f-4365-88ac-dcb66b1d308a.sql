-- Add new columns to communication_templates for draft and submission tracking
ALTER TABLE communication_templates 
ADD COLUMN IF NOT EXISTS submission_status text DEFAULT 'synced' CHECK (submission_status IN ('draft', 'pending_submission', 'synced', 'rejected')),
ADD COLUMN IF NOT EXISTS rejection_reason text,
ADD COLUMN IF NOT EXISTS header_type text CHECK (header_type IN ('text', 'image', 'video', 'document')),
ADD COLUMN IF NOT EXISTS header_content text,
ADD COLUMN IF NOT EXISTS footer_text text,
ADD COLUMN IF NOT EXISTS buttons jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS sample_values jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS submitted_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;