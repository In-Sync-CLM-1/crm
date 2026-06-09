-- Health Sentinel voice-probe log — records each synthetic outbound voice probe
-- the sentinel places (and whether it was later verified as connected) so the
-- dialer tripwire can detect a silently-dead voice path. Reconstructed from the
-- live schema: this migration was applied out-of-band on 2026-06-06 and recorded
-- in schema_migrations without its file being committed; re-added here (idempotent)
-- so `supabase db push` sees local == remote and CI deploys resume.
create table if not exists public.voice_probe_log (
  id uuid primary key default gen_random_uuid(),
  execution_id text,
  placed_at timestamptz not null default now(),
  verified boolean not null default false,
  connected boolean,
  status text
);
create index if not exists idx_voice_probe_unverified
  on public.voice_probe_log(placed_at desc) where verified = false;
alter table public.voice_probe_log enable row level security;
