-- Add tracking columns to email_campaign_recipients table
ALTER TABLE public.email_campaign_recipients 
ADD COLUMN IF NOT EXISTS tracking_pixel_id TEXT,
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS bounce_reason TEXT,
ADD COLUMN IF NOT EXISTS opened_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS open_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS first_clicked_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS complained_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS button_clicks JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS resend_email_id TEXT;

-- Create index for faster lookups by tracking_pixel_id
CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_tracking_pixel 
ON public.email_campaign_recipients(tracking_pixel_id) 
WHERE tracking_pixel_id IS NOT NULL;

-- Create index for faster lookups by resend_email_id
CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_resend_email 
ON public.email_campaign_recipients(resend_email_id) 
WHERE resend_email_id IS NOT NULL;

-- Add comment explaining the tracking columns
COMMENT ON COLUMN public.email_campaign_recipients.tracking_pixel_id IS 'Unique ID for tracking email opens and clicks';
COMMENT ON COLUMN public.email_campaign_recipients.resend_email_id IS 'Resend email ID for webhook event matching';
COMMENT ON COLUMN public.email_campaign_recipients.delivered_at IS 'Timestamp when email was successfully delivered';
COMMENT ON COLUMN public.email_campaign_recipients.bounced_at IS 'Timestamp when email bounced';
COMMENT ON COLUMN public.email_campaign_recipients.opened_at IS 'Timestamp of first email open';
COMMENT ON COLUMN public.email_campaign_recipients.first_clicked_at IS 'Timestamp of first click in email';
COMMENT ON COLUMN public.email_campaign_recipients.complained_at IS 'Timestamp when recipient marked as spam';
COMMENT ON COLUMN public.email_campaign_recipients.button_clicks IS 'Array of button click events with timestamps';