-- Schedule the scheduled-messages-processor to run every 5 minutes
-- This will process:
-- 1. Scheduled email campaigns
-- 2. Scheduled WhatsApp campaigns
-- 3. Individual scheduled emails
-- 4. Individual scheduled WhatsApp messages
-- 5. Activity reminders (30 minutes before meetings/calls/tasks)
SELECT cron.schedule(
  'process-scheduled-messages-and-reminders',
  '*/5 * * * *',  -- Every 5 minutes
  $$
  SELECT net.http_post(
    url := 'https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/scheduled-messages-processor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ***REDACTED_JWT***"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);