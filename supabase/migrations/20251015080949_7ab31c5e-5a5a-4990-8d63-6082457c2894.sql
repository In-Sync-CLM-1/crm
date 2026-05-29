-- Enable pg_cron and pg_net extensions for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule daily subscription status check (runs at 1 AM UTC)
SELECT cron.schedule(
  'daily-subscription-check',
  '0 1 * * *',
  $$
  SELECT net.http_post(
    url := 'https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/subscription-status-checker',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ***REDACTED_JWT***"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Schedule monthly invoice generation (runs on 1st of month at 2 AM UTC)
SELECT cron.schedule(
  'monthly-invoice-generation',
  '0 2 1 * *',
  $$
  SELECT net.http_post(
    url := 'https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/generate-monthly-invoices',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ***REDACTED_JWT***"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Schedule daily payment reminder check (runs at 10 AM UTC)
SELECT cron.schedule(
  'daily-payment-reminders',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := 'https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/send-payment-reminders',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ***REDACTED_JWT***"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);