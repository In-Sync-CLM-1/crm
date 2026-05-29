-- Fix function search path for trigger_retry_failed_whatsapp
DROP FUNCTION IF EXISTS public.trigger_retry_failed_whatsapp();

CREATE OR REPLACE FUNCTION public.trigger_retry_failed_whatsapp()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/retry-failed-whatsapp',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
END;
$$;