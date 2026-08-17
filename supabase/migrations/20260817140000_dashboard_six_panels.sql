-- get_dashboard_overview, narrowed to the six things Amit asked to see and
-- nothing else: organic outcome per channel, paid outcome (Google + Meta),
-- month-wise revenue, campaign spend per month, and tickets raised. New leads
-- come from globalcrm, so they are fetched separately by the dashboard-leads
-- function — they do not live in this database.
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

-- 3. Month-wise revenue. Legacy client_invoices settle by
-- payment_received_date, current billing_documents by their payment rows.
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

-- 5. Campaign spend per month. Google is billed per keyword per day. Meta has
-- never actually spent: every boost so far is blocked or failed, so its budget
-- is reported as attempted, never as spend.
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

-- 1. Organic outcome per channel, last 30 days. Reach and engagement come off
-- the post rows themselves; followers off the daily channel snapshot.
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

-- 2. Paid outcome, last 30 days.
paid AS (
  SELECT jsonb_build_object(
    'google', (
      SELECT jsonb_build_object(
        'spend', COALESCE(SUM(cost), 0), 'impressions', COALESCE(SUM(impressions), 0),
        'clicks', COALESCE(SUM(clicks), 0), 'conversions', COALESCE(SUM(conversions), 0)
      )
      FROM mkt_google_ads_keywords
      WHERE org_id = _org_id AND metrics_date > current_date - 30
    ),
    'meta', (
      SELECT jsonb_build_object(
        'spend', 0,
        'attempted_budget', COALESCE(SUM(total_budget_paise) / 100.0, 0),
        'blocked', COUNT(*) FILTER (WHERE status = 'blocked'),
        'failed', COUNT(*) FILTER (WHERE status = 'failed'),
        'live', COUNT(*) FILTER (WHERE status NOT IN ('blocked', 'failed')),
        'last_attempt', MAX(week_start)::text
      )
      FROM mkt_boost_history WHERE org_id = _org_id
    )
  ) AS obj
),

-- 6. Tickets raised.
tickets AS (
  SELECT jsonb_build_object(
    'raised_30d', COUNT(*) FILTER (WHERE created_at > now() - interval '30 days'),
    'open', COUNT(*) FILTER (WHERE status NOT IN ('closed', 'resolved')),
    'overdue', COUNT(*) FILTER (WHERE status NOT IN ('closed', 'resolved') AND due_at < now()),
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
  'tickets',        COALESCE((SELECT obj FROM tickets), '{}'::jsonb)
);
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_overview(uuid, integer) TO authenticated;
