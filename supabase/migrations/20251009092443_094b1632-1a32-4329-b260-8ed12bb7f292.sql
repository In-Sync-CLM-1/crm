-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Create a function to call the retry edge function
CREATE OR REPLACE FUNCTION public.trigger_retry_failed_whatsapp()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Call the retry edge function via pg_net
  PERFORM net.http_post(
    url := 'https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/retry-failed-whatsapp',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- Schedule the retry job to run every 5 minutes
-- Note: This will be executed in Supabase dashboard or via SQL editor
-- Run this command: SELECT cron.schedule('retry-failed-whatsapp', '*/5 * * * *', 'SELECT public.trigger_retry_failed_whatsapp();');

COMMENT ON FUNCTION public.trigger_retry_failed_whatsapp() IS 'Triggers the retry-failed-whatsapp edge function to process failed WhatsApp messages';