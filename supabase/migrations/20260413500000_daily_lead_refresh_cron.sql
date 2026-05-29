-- Daily lead refresh cron job.
--
-- Fires at 01:00 UTC (06:30 IST) every day.
-- Calls mkt-daily-lead-refresh which checks every active product across all orgs;
-- for any product with fewer than 3000 status='new' contacts it fires mkt-source-leads
-- (self-chaining, cursor-based) to top the pool back up.

SELECT cron.unschedule('mkt-daily-lead-refresh') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'mkt-daily-lead-refresh'
);

SELECT cron.schedule(
  'mkt-daily-lead-refresh',
  '0 1 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://mlvgqudcwlkolsbighnn.supabase.co/functions/v1/mkt-daily-lead-refresh',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ***REDACTED_JWT***"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);
