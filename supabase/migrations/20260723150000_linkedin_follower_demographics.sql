-- LinkedIn follower audience demographics (2026-07-23, Arohan brief): the
-- real, closest available substitute for the requested "per-post engager
-- demographics" — LinkedIn's API does not expose engager-level identity
-- data for organic posts at any access tier (verified against the July
-- 2026 API docs). What IS available: aggregate demographic composition of
-- the page's whole follower base (organizationalEntityFollowerStatistics),
-- which is the real-world audience signal a Facebook campaign should be
-- targeted against. One snapshot row per org per week.
CREATE TABLE IF NOT EXISTS public.mkt_linkedin_follower_demographics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  snapshot_date date NOT NULL,
  total_followers int,
  -- each: [{"label": "...", "urn": "urn:li:...", "count": N}, ...] sorted desc, top 15
  by_seniority jsonb,
  by_function jsonb,
  by_industry jsonb,
  by_country jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mkt_li_follower_demo_org_week ON public.mkt_linkedin_follower_demographics (org_id, snapshot_date);

ALTER TABLE public.mkt_linkedin_follower_demographics ENABLE ROW LEVEL SECURITY;
