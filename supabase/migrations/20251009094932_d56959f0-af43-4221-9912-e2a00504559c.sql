-- Setup cron job to run queue processor every 5 minutes
SELECT cron.schedule(
  'process-operation-queue',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/queue-processor',
    headers := '{"Authorization": "Bearer ***REDACTED_JWT***", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);