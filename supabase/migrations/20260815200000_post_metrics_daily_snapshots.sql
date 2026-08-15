-- Daily snapshot of per-post engagement, so "per day" charts can show what
-- actually happened on each day.
--
-- blog_posts stores only the CUMULATIVE lifetime total per post, which is why
-- the Social Performance "reach per day" and "interactions per day" charts were
-- wrong: they plotted each post's lifetime total against its publish date, so a
-- post that gathered 17,000 impressions over two weeks appeared as a single
-- spike on the day it went out, and every day without a post read as zero.
--
-- One row per post per channel per day. The engagement trackers upsert today's
-- row on every sweep (hourly), so the last write of a day is that day's closing
-- cumulative value; a real per-day figure is the difference between consecutive
-- days. Deltas are derived at read time rather than stored, so a re-read that
-- corrects a number corrects the series too.
CREATE TABLE IF NOT EXISTS public.mkt_post_metrics_daily (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL,
  post_id      uuid NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  stat_date    date NOT NULL,
  channel      text NOT NULL CHECK (channel IN ('linkedin','facebook','instagram','youtube','x')),
  -- Cumulative-to-date, NOT the day's increment. NULL means "not available on
  -- this channel" and must stay distinguishable from a real zero (Facebook has
  -- no post-level reach at all since Meta retired post_impressions in v21).
  reach        integer,
  interactions integer,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mkt_post_metrics_daily_unique
  ON public.mkt_post_metrics_daily (post_id, channel, stat_date);

CREATE INDEX IF NOT EXISTS mkt_post_metrics_daily_org_date
  ON public.mkt_post_metrics_daily (org_id, stat_date);

ALTER TABLE public.mkt_post_metrics_daily ENABLE ROW LEVEL SECURITY;

-- Same visibility rule as the posts themselves: members of the owning org.
DROP POLICY IF EXISTS "org members read post metrics" ON public.mkt_post_metrics_daily;
CREATE POLICY "org members read post metrics"
  ON public.mkt_post_metrics_daily
  FOR SELECT
  USING (
    org_id IN (
      SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

-- Writes come only from the trackers, which run as service role and bypass RLS.
