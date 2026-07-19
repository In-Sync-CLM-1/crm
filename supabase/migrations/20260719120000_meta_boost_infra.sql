-- Meta (Facebook/Instagram) post-boost infrastructure.
-- Budget decided 2026-07-19: ₹200/day x 4 days, capped ₹800/week, one boost/week.
-- Boosting itself stays blocked until fb_ad_account_id is set (requires a Meta
-- Ads account with a payment method linked in Business Manager — a manual,
-- interactive step outside API reach).

alter table mkt_social_config
  add column if not exists fb_ad_account_id text;

create table if not exists mkt_boost_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  channel text not null check (channel in ('facebook', 'instagram')),
  source_post_id uuid references blog_posts(id),
  fb_post_id text,
  campaign_id text,
  adset_id text,
  ad_id text,
  daily_budget_paise integer not null,
  total_budget_paise integer not null,
  days integer not null,
  week_start date not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'completed', 'failed', 'blocked')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, week_start)
);

alter table mkt_boost_history enable row level security;

drop policy if exists "service role full access" on mkt_boost_history;
create policy "service role full access" on mkt_boost_history
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "org members read" on mkt_boost_history;
create policy "org members read" on mkt_boost_history
  for select using (
    exists (
      select 1 from user_roles ur
      where ur.user_id = auth.uid() and ur.org_id = mkt_boost_history.org_id
    )
  );

insert into mkt_engine_config (org_id, config_key, config_value, description)
select o.id, 'boost_settings',
  '{"daily_budget_paise": 20000, "days": 4, "weekly_cap_paise": 80000, "currency": "INR"}'::jsonb,
  'Meta post-boost budget: ₹200/day x 4 days, ₹800/week cap. Raise these to scale up spend.'
from organizations o
where o.id = (select org_id from mkt_social_config where active = true limit 1)
on conflict (org_id, config_key) do nothing;
