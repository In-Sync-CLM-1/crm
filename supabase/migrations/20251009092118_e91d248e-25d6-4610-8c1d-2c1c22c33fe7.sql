-- Create increment_campaign_stats function for atomic updates
CREATE OR REPLACE FUNCTION public.increment_campaign_stats(
  p_campaign_id UUID,
  p_sent_increment INTEGER DEFAULT 0,
  p_failed_increment INTEGER DEFAULT 0,
  p_pending_increment INTEGER DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE whatsapp_bulk_campaigns
  SET 
    sent_count = sent_count + p_sent_increment,
    failed_count = failed_count + p_failed_increment,
    pending_count = pending_count + p_pending_increment,
    updated_at = NOW()
  WHERE id = p_campaign_id;
END;
$$;

-- Create rate limiting table
CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  user_id UUID,
  operation TEXT NOT NULL,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add index for rate limit queries
CREATE INDEX IF NOT EXISTS idx_rate_limit_log_org_operation_time 
ON public.rate_limit_log(org_id, operation, created_at);

-- Enable RLS on rate_limit_log
ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;

-- Policy for service role to manage rate limits
CREATE POLICY "Service role can manage rate limits"
ON public.rate_limit_log
FOR ALL
USING (true)
WITH CHECK (true);

-- Add webhook signature column for security
ALTER TABLE whatsapp_settings 
ADD COLUMN IF NOT EXISTS webhook_secret TEXT;

-- Add index on gupshup_message_id for faster webhook lookups
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_gupshup_id 
ON whatsapp_messages(gupshup_message_id) 
WHERE gupshup_message_id IS NOT NULL;