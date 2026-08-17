-- Real Meta ad performance, one row per ad account per day. Filled by
-- mkt-meta-insights, which walks every ad account the stored credentials can
-- reach. Empty means "we could not read it", never "there was no spend" — the
-- dashboard reports the difference, because a promotion IS live in Ads Center
-- on an account outside the business (verified 2026-08-17: the one account the
-- business owns, act_1503032350759926, has zero lifetime spend and no ads).
CREATE TABLE IF NOT EXISTS public.mkt_meta_insights_daily (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  ad_account_id text NOT NULL,
  account_name  text,
  stat_date     date NOT NULL,
  spend         numeric NOT NULL DEFAULT 0,
  impressions   bigint  NOT NULL DEFAULT 0,
  reach         bigint  NOT NULL DEFAULT 0,
  clicks        bigint  NOT NULL DEFAULT 0,
  results       bigint  NOT NULL DEFAULT 0,
  currency      text,
  synced_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, ad_account_id, stat_date)
);

ALTER TABLE public.mkt_meta_insights_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members read meta insights" ON public.mkt_meta_insights_daily;
CREATE POLICY "org members read meta insights" ON public.mkt_meta_insights_daily
  FOR SELECT USING (org_id = get_user_org_id(auth.uid()) OR is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "service role writes meta insights" ON public.mkt_meta_insights_daily;
CREATE POLICY "service role writes meta insights" ON public.mkt_meta_insights_daily
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_meta_insights_org_date
  ON public.mkt_meta_insights_daily (org_id, stat_date DESC);

-- Dashboard data: add the BD outreach funnel, and read Meta spend from whatever
-- ad accounts we can actually see rather than assuming one.
CREATE OR REPLACE FUNCTION public.get_dashboard_overview(_org_id uuid, _months integer DEFAULT 12)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH months AS (
  SELECT date_trunc('month', current_date) - (n || ' months')::interval AS m
  FROM generate_series(_months - 1, 0, -1) n
),
invoiced AS (
  SELECT date_trunc('month', ci.invoice_date)::date AS m,
         SUM(COALESCE(ci.amount, 0) + COALESCE(ci.tax_amount, 0)) AS amt
  FROM client_invoices ci
  WHERE ci.org_id = _org_id AND ci.invoice_date IS NOT NULL
  GROUP BY 1
  UNION ALL
  SELECT date_trunc('month', bd.doc_date)::date, SUM(COALESCE(bd.total_amount, 0))
  FROM billing_documents bd
  WHERE bd.org_id = _org_id AND bd.doc_type = 'invoice'
    AND bd.status NOT IN ('draft', 'cancelled')
  GROUP BY 1
),
received AS (
  SELECT date_trunc('month', ci.payment_received_date)::date AS m,
         SUM(COALESCE(ci.actual_payment_received,
                      COALESCE(ci.amount, 0) + COALESCE(ci.tax_amount, 0) - COALESCE(ci.tds_amount, 0))) AS amt
  FROM client_invoices ci
  WHERE ci.org_id = _org_id AND ci.payment_received_date IS NOT NULL
  GROUP BY 1
  UNION ALL
  SELECT date_trunc('month', bp.payment_date)::date, SUM(COALESCE(bp.amount, 0))
  FROM billing_payments bp
  WHERE bp.org_id = _org_id AND bp.payment_date IS NOT NULL
  GROUP BY 1
),
google_spend AS (
  SELECT date_trunc('month', metrics_date)::date AS m, SUM(COALESCE(cost, 0)) AS amt
  FROM mkt_google_ads_keywords
  WHERE org_id = _org_id AND metrics_date IS NOT NULL
  GROUP BY 1
),
revenue_months AS (
  SELECT jsonb_agg(jsonb_build_object(
           'month', to_char(mo.m, 'Mon YY'),
           'invoiced', COALESCE((SELECT SUM(amt) FROM invoiced i WHERE i.m = mo.m::date), 0),
           'received', COALESCE((SELECT SUM(amt) FROM received r WHERE r.m = mo.m::date), 0),
           'google_spend', COALESCE((SELECT SUM(amt) FROM google_spend g WHERE g.m = mo.m::date), 0)
         ) ORDER BY mo.m) AS rows
  FROM months mo
),
organic AS (
  SELECT jsonb_agg(x ORDER BY (x->>'posts')::int DESC) AS rows FROM (
    SELECT jsonb_build_object(
      'channel', c.channel, 'posts', c.posts, 'reach', c.reach, 'engagement', c.engagement,
      'followers', COALESCE(f.followers, 0), 'follower_change', COALESCE(f.followers - f.prev, 0)
    ) AS x
    FROM (
      SELECT 'linkedin' AS channel,
             COUNT(*) FILTER (WHERE linkedin_post_urn IS NOT NULL) AS posts,
             COALESCE(SUM(linkedin_impressions), 0) AS reach,
             COALESCE(SUM(linkedin_likes + linkedin_comments + linkedin_reposts), 0) AS engagement
      FROM blog_posts WHERE org_id = _org_id AND posted_timestamp > now() - interval '30 days'
      UNION ALL
      SELECT 'facebook', COUNT(*) FILTER (WHERE fb_post_id IS NOT NULL),
             COALESCE(SUM(fb_clicks), 0), COALESCE(SUM(fb_likes + fb_comments + fb_shares), 0)
      FROM blog_posts WHERE org_id = _org_id AND posted_timestamp > now() - interval '30 days'
      UNION ALL
      SELECT 'instagram', COUNT(*) FILTER (WHERE ig_post_id IS NOT NULL OR ig_reel_id IS NOT NULL),
             COALESCE(SUM(ig_reach), 0), COALESCE(SUM(ig_likes + ig_comments + ig_saves + ig_shares), 0)
      FROM blog_posts WHERE org_id = _org_id AND posted_timestamp > now() - interval '30 days'
      UNION ALL
      SELECT 'youtube', COUNT(*) FILTER (WHERE yt_video_id IS NOT NULL),
             COALESCE(SUM(yt_views), 0), COALESCE(SUM(yt_likes + yt_comments), 0)
      FROM blog_posts WHERE org_id = _org_id AND posted_timestamp > now() - interval '30 days'
      UNION ALL
      SELECT 'x', COUNT(*) FILTER (WHERE x_post_id IS NOT NULL),
             COALESCE(SUM(x_impressions), 0), COALESCE(SUM(x_likes + x_replies + x_reposts), 0)
      FROM blog_posts WHERE org_id = _org_id AND posted_timestamp > now() - interval '30 days'
    ) c
    LEFT JOIN (
      SELECT DISTINCT ON (channel) channel, followers,
             COALESCE((SELECT s2.followers FROM mkt_channel_stats_daily s2
                        WHERE s2.channel = s.channel AND s2.org_id = s.org_id
                          AND s2.stat_date <= current_date - 30
                        ORDER BY s2.stat_date DESC LIMIT 1), followers) AS prev
      FROM mkt_channel_stats_daily s WHERE s.org_id = _org_id
      ORDER BY channel, stat_date DESC
    ) f ON f.channel = c.channel
  ) y
),
paid AS (
  SELECT jsonb_build_object(
    'google', (
      SELECT jsonb_build_object(
        'spend', COALESCE(SUM(cost), 0), 'impressions', COALESCE(SUM(impressions), 0),
        'clicks', COALESCE(SUM(clicks), 0), 'conversions', COALESCE(SUM(conversions), 0),
        'daily_budget', (SELECT (config_value->'google'->>'daily_budget')::numeric
                           FROM mkt_engine_config
                          WHERE org_id = _org_id AND config_key = 'paid_ads_budget'),
        'last_synced', (SELECT MAX(metrics_date)::text FROM mkt_google_ads_keywords WHERE org_id = _org_id)
      )
      FROM mkt_google_ads_keywords
      WHERE org_id = _org_id AND metrics_date > current_date - 30
    ),
    -- Meta spend is whatever mkt_meta_insights_daily holds. That table is filled
    -- by mkt-meta-insights from every ad account the credentials can reach; if
    -- the account funding a promotion is not among them the figures stay null,
    -- and the dashboard says so instead of printing a zero.
    'meta', (
      SELECT jsonb_build_object(
        'spend', SUM(spend), 'impressions', SUM(impressions), 'reach', SUM(reach),
        'clicks', SUM(clicks), 'results', SUM(results),
        'accounts', COUNT(DISTINCT ad_account_id),
        'last_synced', MAX(stat_date)::text
      )
      FROM mkt_meta_insights_daily
      WHERE org_id = _org_id AND stat_date > current_date - 30
    ),
    'meta_attempted', (
      SELECT jsonb_build_object(
        'budget', COALESCE(SUM(total_budget_paise) / 100.0, 0),
        'blocked', COUNT(*) FILTER (WHERE status = 'blocked'),
        'failed', COUNT(*) FILTER (WHERE status = 'failed'),
        'last_attempt', MAX(week_start)::text
      )
      FROM mkt_boost_history WHERE org_id = _org_id
    )
  ) AS obj
),
-- BD outreach: the funnel from sourced firm to a live sequence.
bd AS (
  SELECT jsonb_build_object(
    'sourced',    (SELECT COUNT(*) FROM bd_firms WHERE org_id = _org_id),
    'graded_a',   (SELECT COUNT(*) FROM bd_firms WHERE org_id = _org_id AND grade = 'A'),
    'graded_b',   (SELECT COUNT(*) FROM bd_firms WHERE org_id = _org_id AND grade = 'B'),
    'researched', (SELECT COUNT(*) FROM bd_firms WHERE org_id = _org_id AND researched_at IS NOT NULL),
    'contactable',(SELECT COUNT(*) FROM bd_contacts WHERE org_id = _org_id),
    'drafted',    (SELECT COUNT(*) FROM bd_drafts WHERE org_id = _org_id),
    'pending_review', (SELECT COUNT(*) FROM bd_drafts WHERE org_id = _org_id AND status = 'pending'),
    'sequences_live', (SELECT COUNT(*) FROM bd_sequences WHERE org_id = _org_id AND stopped_at IS NULL),
    'sequences_stopped', (SELECT COUNT(*) FROM bd_sequences WHERE org_id = _org_id AND stopped_at IS NOT NULL),
    'excluded',   (SELECT COUNT(*) FROM bd_exclusions WHERE org_id = _org_id)
  ) AS obj
),
tickets AS (
  SELECT jsonb_build_object(
    'raised_30d', COUNT(*) FILTER (WHERE created_at > now() - interval '30 days'),
    'open', COUNT(*) FILTER (WHERE status NOT IN ('closed', 'resolved')),
    'overdue', COUNT(*) FILTER (WHERE status NOT IN ('closed', 'resolved') AND due_at < now()),
    'resolved_30d', COUNT(*) FILTER (WHERE resolved_at > now() - interval '30 days'),
    'monthly', (
      SELECT jsonb_agg(jsonb_build_object('month', to_char(mo.m, 'Mon YY'),
               'raised', (SELECT COUNT(*) FROM support_tickets t
                           WHERE t.org_id = _org_id
                             AND date_trunc('month', t.created_at)::date = mo.m::date)) ORDER BY mo.m)
      FROM months mo
    )
  ) AS obj
  FROM support_tickets WHERE org_id = _org_id
)
SELECT jsonb_build_object(
  'revenue_months', COALESCE((SELECT rows FROM revenue_months), '[]'::jsonb),
  'organic',        COALESCE((SELECT rows FROM organic), '[]'::jsonb),
  'paid',           COALESCE((SELECT obj FROM paid), '{}'::jsonb),
  'bd',             COALESCE((SELECT obj FROM bd), '{}'::jsonb),
  'tickets',        COALESCE((SELECT obj FROM tickets), '{}'::jsonb)
);
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_overview(uuid, integer) TO authenticated;
