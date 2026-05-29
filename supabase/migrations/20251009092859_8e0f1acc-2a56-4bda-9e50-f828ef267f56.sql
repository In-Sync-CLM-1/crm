-- Update the cron job schedule from every 5 minutes to every 60 minutes
SELECT cron.unschedule('retry-failed-whatsapp-messages');

-- Reschedule to run every hour (at minute 0)
SELECT cron.schedule(
  'retry-failed-whatsapp-messages',
  '0 * * * *',
  'SELECT public.trigger_retry_failed_whatsapp();'
);

-- Verify the updated schedule
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'retry-failed-whatsapp-messages';