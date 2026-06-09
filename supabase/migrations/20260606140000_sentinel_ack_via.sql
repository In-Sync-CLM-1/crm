-- Health Sentinel: record HOW an incident was acknowledged (e.g. 'whatsapp',
-- 'email', 'snooze') alongside the existing acknowledged_at/ack_token, so the
-- escalation gate and the wall-clock snooze can tell apart channels. Reconstructed
-- from the live schema: applied out-of-band on 2026-06-06 and recorded in
-- schema_migrations without its file being committed; re-added here (idempotent)
-- so `supabase db push` sees local == remote and CI deploys resume.
alter table public.sentinel_incidents
  add column if not exists acknowledged_via text;
