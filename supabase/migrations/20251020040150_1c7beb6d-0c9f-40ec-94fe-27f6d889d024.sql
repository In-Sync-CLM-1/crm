-- Schedule automation email sender to run every 5 minutes
SELECT cron.schedule(
  'automation-email-sender',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT
    net.http_post(
        url:='https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/automation-email-sender',
        headers:='{"Content-Type": "application/json"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);