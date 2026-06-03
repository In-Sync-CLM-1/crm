-- Health Sentinel self-heartbeat — the watchman's own pulse, so a separate
-- tripwire can alarm on its ABSENCE (the Sentinel's failure mode is silence: a
-- 401'd invoker, a revoked MGMT_TOKEN, or a dead cron produces no output, no
-- email, no incident row — nothing to alert on). The Sentinel stamps a row here
-- on each successful run; sentinel-tripwire reads it and pages if it goes stale.
--   kind='watch'  → stamped on every successful end-to-end run (hourly)
--   kind='digest' → stamped only when the daily digest email actually sends 2xx
create table if not exists public.sentinel_heartbeat (
  kind       text primary key,                       -- 'watch' | 'digest'
  last_ok_at timestamptz not null default now(),
  detail     jsonb,
  updated_at timestamptz not null default now()
);
-- Service role (the only writer/reader) bypasses RLS; enable it so the Sentinel's
-- own RLS-exposure check doesn't flag this table as publicly accessible.
alter table public.sentinel_heartbeat enable row level security;
