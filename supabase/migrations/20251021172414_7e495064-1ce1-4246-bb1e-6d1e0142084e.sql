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
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpemdweGFxdnR2dnFhcnpqbXplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2MTcwNzYsImV4cCI6MjA3NTE5MzA3Nn0.eBLy2zBEiZoLiDXFpLupi7bUOaOk4XNJo_wEIiLuLpE"}'::jsonb,
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;