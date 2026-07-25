-- Follow-request campaign: named campaigns, full click tracking, and the
-- large-company exclusion list.
--
-- 1. Naming. Every row now carries the campaign it belongs to, so the marketing
--    UI can report on "Founder Follow — Decision Makers" and "Founder Follow —
--    Practitioners" as distinct campaigns rather than an undifferentiated pile
--    of rows keyed by an internal segment string.
--
-- 2. Click tracking split three ways. The follow button, the "read it here"
--    post link, and the Facebook button are separate intents and have to be
--    counted separately — a post read is interest, a follow click is the goal.
--
-- 3. Excluded companies. The audience is deliberately SMB-only. The strongest
--    size signal turned out to be how many contacts a company has in the source
--    database: TCS appears ~4,000 times, a real SMB once or twice. Companies
--    above the threshold are materialised here (rather than recomputed nightly)
--    because the source list is a client database this project only reads, and
--    a 24k-row membership check is far cheaper than a grouped cross-project
--    query on every top-up run.

ALTER TABLE public.mkt_follow_campaign
  ADD COLUMN IF NOT EXISTS campaign_key    text,
  ADD COLUMN IF NOT EXISTS campaign_name   text,
  ADD COLUMN IF NOT EXISTS post_clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS post_click_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fb_clicked_at   timestamptz,
  ADD COLUMN IF NOT EXISTS fb_click_count  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS company_size_note text;

-- Backfill naming for anything already queued, then make it the default going
-- forward. Segment → campaign is 1:1 and set by the top-up job.
UPDATE public.mkt_follow_campaign
   SET campaign_key  = CASE segment WHEN 'leader' THEN 'founder-follow-decision-makers'
                                    ELSE 'founder-follow-practitioners' END,
       campaign_name = CASE segment WHEN 'leader' THEN 'Founder Follow — Decision Makers'
                                    ELSE 'Founder Follow — Practitioners' END
 WHERE campaign_key IS NULL;

CREATE INDEX IF NOT EXISTS mkt_follow_campaign_campaign_idx
  ON public.mkt_follow_campaign (org_id, campaign_key, status);

-- Companies large enough to be out of scope for an SMB campaign.
CREATE TABLE IF NOT EXISTS public.mkt_follow_excluded_companies (
  company_name text PRIMARY KEY,
  contact_count integer,
  reason        text NOT NULL DEFAULT 'contact_frequency',
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mkt_follow_excluded_companies IS
  'Companies excluded from the founder follow campaign for being too large. Populated from source-database contact frequency; refresh occasionally, it changes slowly.';

ALTER TABLE public.mkt_follow_excluded_companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read excluded companies" ON public.mkt_follow_excluded_companies;
CREATE POLICY "read excluded companies"
  ON public.mkt_follow_excluded_companies FOR SELECT TO authenticated USING (true);

-- Per-campaign rollup for the marketing UI. A view keeps the metric definitions
-- in one place instead of duplicating the same counts across the dashboard,
-- Arohan's context, and any later reporting.
CREATE OR REPLACE VIEW public.mkt_follow_campaign_stats AS
SELECT
  org_id,
  campaign_key,
  max(campaign_name)                                             AS campaign_name,
  segment,
  count(*)                                                       AS total_people,
  count(*) FILTER (WHERE status = 'queued')                      AS queued,
  count(*) FILTER (WHERE sent_at IS NOT NULL)                    AS sent,
  count(*) FILTER (WHERE delivered_at IS NOT NULL)               AS delivered,
  count(*) FILTER (WHERE opened_at IS NOT NULL)                  AS opened,
  count(*) FILTER (WHERE clicked_at IS NOT NULL)                 AS follow_clicks,
  count(*) FILTER (WHERE post_clicked_at IS NOT NULL)            AS post_reads,
  count(*) FILTER (WHERE fb_clicked_at IS NOT NULL)              AS facebook_clicks,
  count(*) FILTER (WHERE reminder_sent_at IS NOT NULL)           AS reminders_sent,
  count(*) FILTER (WHERE status = 'bounced')                     AS bounced,
  count(*) FILTER (WHERE status = 'unsubscribed')                AS unsubscribed,
  count(*) FILTER (WHERE status = 'complained')                  AS complained,
  count(*) FILTER (WHERE status = 'failed')                      AS failed,
  count(*) FILTER (WHERE sent_at >= date_trunc('day', now()))    AS sent_today,
  count(*) FILTER (WHERE delivered_at >= date_trunc('day', now())) AS delivered_today,
  min(sent_at)                                                   AS first_sent_at,
  max(sent_at)                                                   AS last_sent_at
FROM public.mkt_follow_campaign
GROUP BY org_id, campaign_key, segment;

COMMENT ON VIEW public.mkt_follow_campaign_stats IS
  'Per-campaign rollup for the marketing dashboard. Delivered/opened/clicked come from Resend webhook events; follow_clicks is the conversion metric, post_reads is interest.';
