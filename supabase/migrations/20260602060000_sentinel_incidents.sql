-- Health Sentinel incident state — remembers each (project, system) failure
-- across runs so the worker can compute outage windows ("failed aa:aa–bb:bb,
-- restored"), drive auto-fix vs escalate, and stop escalating once acknowledged.
create table if not exists public.sentinel_incidents (
  id uuid primary key default gen_random_uuid(),
  project text not null,
  system text not null,
  detail text,
  status text not null default 'open',            -- open | resolved
  correctable boolean not null default false,
  auto_fixed boolean not null default false,
  fix_note text,
  first_failed_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  escalated_email_at timestamptz,
  escalated_wa_at timestamptz,
  escalated_call_at timestamptz,
  escalation_count int not null default 0,
  acknowledged_at timestamptz,
  ack_token text default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sentinel_incidents_open_uniq
  on public.sentinel_incidents(project, system) where status = 'open';
create index if not exists sentinel_incidents_status_idx on public.sentinel_incidents(status);
alter table public.sentinel_incidents enable row level security;
