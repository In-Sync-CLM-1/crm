-- Daily per-channel snapshot (followers etc.) powering the Social Performance
-- dashboard's growth trends. One row per org/channel/day, upserted by the
-- engagement trackers on their nightly runs.
CREATE TABLE IF NOT EXISTS public.mkt_channel_stats_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  stat_date date NOT NULL,
  channel text NOT NULL,
  followers integer,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, stat_date, channel)
);

ALTER TABLE public.mkt_channel_stats_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on mkt_channel_stats_daily" ON public.mkt_channel_stats_daily;
CREATE POLICY "Service role full access on mkt_channel_stats_daily"
  ON public.mkt_channel_stats_daily FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view channel stats in their org" ON public.mkt_channel_stats_daily;
CREATE POLICY "Users can view channel stats in their org"
  ON public.mkt_channel_stats_daily FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));
