-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a cron job to run daily lead scoring at 2 AM every day
SELECT cron.schedule(
  'daily-lead-scoring',
  '0 2 * * *', -- At 2:00 AM every day
  $$
  SELECT
    net.http_post(
      url := 'https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/daily-lead-scoring',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ***REDACTED_JWT***"}'::jsonb,
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;