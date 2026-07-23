-- Weekly self-reported outreach metrics (2026-07-24, Arohan recommendation:
-- "change what you're tracking" — impressions are noise, connection
-- accepts/profile views/DMs-to-viewers/replies are what actually end in a
-- demo). None of these are available via LinkedIn's API (see
-- mkt_linkedin_follower_demographics for the platform-limits context), so
-- this is Amit's own weekly count, entered via Arohan chat ("Weekly
-- Outreach: ...") and read back into Arohan's context.
CREATE TABLE IF NOT EXISTS public.mkt_persona_outreach_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  week_start date NOT NULL,
  connections_accepted_target_titles int,
  profile_views int,
  dms_sent_to_viewers int,
  replies_received int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mkt_persona_outreach_org_week ON public.mkt_persona_outreach_metrics (org_id, week_start);

ALTER TABLE public.mkt_persona_outreach_metrics ENABLE ROW LEVEL SECURITY;
