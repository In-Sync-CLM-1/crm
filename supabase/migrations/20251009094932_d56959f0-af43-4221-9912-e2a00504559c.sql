-- Setup cron job to run queue processor every 5 minutes
SELECT cron.schedule(
  'process-operation-queue',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/queue-processor',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpemdweGFxdnR2dnFhcnpqbXplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2MTcwNzYsImV4cCI6MjA3NTE5MzA3Nn0.eBLy2zBEiZoLiDXFpLupi7bUOaOk4XNJo_wEIiLuLpE", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);