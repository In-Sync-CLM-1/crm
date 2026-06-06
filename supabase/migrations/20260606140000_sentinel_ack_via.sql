-- Record HOW a Sentinel alert was acknowledged (whatsapp button / email link /
-- ai-call), so acknowledgements are auditable, not just a bare timestamp.
alter table public.sentinel_incidents add column if not exists acknowledged_via text;
