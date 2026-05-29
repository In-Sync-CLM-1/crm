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
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpemdweGFxdnR2dnFhcnpqbXplIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTYxNzA3NiwiZXhwIjoyMDc1MTkzMDc2fQ.Sjmv_qAGxwPOVx3KBNS0l3WXm_6pIf4LlTmHFPCLozg"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);