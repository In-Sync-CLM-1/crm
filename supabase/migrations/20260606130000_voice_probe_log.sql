-- Health Sentinel external-API probes: voice (Exotel) end-to-end test-call log.
-- The Sentinel places a real test call each hour; because connection is async,
-- the NEXT run verifies the PREVIOUS call actually reached the carrier (the exact
-- thing that errored during the 2026-06-05 Exotel voice outage — 3,725 attempts,
-- 0 connected — which the Sentinel was blind to). Service-role only.
create table if not exists public.voice_probe_log (
  id            uuid primary key default gen_random_uuid(),
  execution_id  text,
  placed_at     timestamptz not null default now(),
  verified      boolean not null default false,
  connected     boolean,
  status        text
);

alter table public.voice_probe_log enable row level security;
-- No policies: only the service-role key (Sentinel) reads/writes this. Anon/auth
-- get nothing, which is correct for an internal ops log.

create index if not exists idx_voice_probe_unverified
  on public.voice_probe_log (placed_at desc) where verified = false;
