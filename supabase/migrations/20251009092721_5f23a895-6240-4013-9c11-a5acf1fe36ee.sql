-- Schedule the cron job to run retry function every 5 minutes
SELECT cron.schedule(
  'retry-failed-whatsapp-messages',
  '*/5 * * * *',
  'SELECT public.trigger_retry_failed_whatsapp();'
);

-- Verify the cron job was created
SELECT * FROM cron.job WHERE jobname = 'retry-failed-whatsapp-messages';