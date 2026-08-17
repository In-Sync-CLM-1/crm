-- get_dashboard_overview — everything the rebuilt dashboard shows, in one call.
--
-- The old dashboard answered "how much did we invoice" and little else: a
-- pipeline chart for a module that no longer exists, a communication-activity
-- chart that has been empty since the campaigns stopped, and a revenue-by-client
-- chart that honoured the page's date filter while claiming to show six months,
-- so a single invoice rendered as one dot. This returns what the CRM actually
-- does day to day — money, the marketing engine, and work in flight — as one
-- jsonb payload so the page makes a single round trip.
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

-- Money in: legacy client_invoices settle by payment_received_date, current
-- billing_documents by their payment rows. Money out comes from journal lines
-- against a bank account, so it only covers months where the ledger has been
-- kept — at the time of writing that is June 2026 onward. The chart labels it
-- as ledger-sourced rather than pretending the empty months are zero spend.
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
paid_out AS (
  SELECT date_trunc('month', je.entry_date)::date AS m, SUM(COALESCE(jel.credit, 0)) AS amt
  FROM journal_entries je
  JOIN journal_entry_lines jel ON jel.entry_id = je.id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.org_id = _org_id AND coa.is_bank_account IS TRUE
  GROUP BY 1
),
money AS (
  SELECT jsonb_agg(jsonb_build_object(
           'month', to_char(mo.m, 'Mon YY'),
           'invoiced', COALESCE((SELECT SUM(amt) FROM invoiced i WHERE i.m = mo.m::date), 0),
           'received', COALESCE((SELECT SUM(amt) FROM received r WHERE r.m = mo.m::date), 0),
           'paid_out', COALESCE((SELECT SUM(amt) FROM paid_out p WHERE p.m = mo.m::date), 0)
         ) ORDER BY mo.m) AS rows
  FROM months mo
),

-- Marketing engine
social AS (
  SELECT jsonb_agg(jsonb_build_object(
           'channel', s.channel, 'followers', s.followers, 'change_30d', s.followers - s.prev
         ) ORDER BY s.followers DESC) AS rows
  FROM (
    SELECT DISTINCT ON (channel) channel,
           followers,
           COALESCE((SELECT c2.followers FROM mkt_channel_stats_daily c2
                      WHERE c2.channel = c.channel AND c2.org_id = c.org_id
                        AND c2.stat_date <= current_date - 30
                      ORDER BY c2.stat_date DESC LIMIT 1), followers) AS prev
    FROM mkt_channel_stats_daily c
    WHERE c.org_id = _org_id
    ORDER BY channel, stat_date DESC
  ) s
),
posts AS (
  SELECT jsonb_build_object(
           'published_30d', COUNT(*) FILTER (WHERE posted_timestamp > now() - interval '30 days'),
           'published_7d',  COUNT(*) FILTER (WHERE posted_timestamp > now() - interval '7 days'),
           -- ordered by the real week, not by the formatted label: sorting
           -- "DD Mon" as text puts 03 Aug before 06 Jul.
           'weekly', (
             SELECT jsonb_agg(jsonb_build_object('week', to_char(wk, 'DD Mon'), 'posts', n) ORDER BY wk)
             FROM (
               SELECT date_trunc('week', posted_timestamp) AS wk, COUNT(*) AS n
               FROM blog_posts
               WHERE org_id = _org_id AND posted_timestamp > now() - interval '8 weeks'
               GROUP BY 1
             ) x
           )
         ) AS obj
  FROM blog_posts WHERE org_id = _org_id
),
ads AS (
  SELECT jsonb_build_object(
           'spend_30d', COALESCE(SUM(cost), 0),
           'clicks_30d', COALESCE(SUM(clicks), 0),
           'impressions_30d', COALESCE(SUM(impressions), 0),
           'conversions_30d', COALESCE(SUM(conversions), 0)
         ) AS obj
  FROM mkt_google_ads_keywords
  WHERE org_id = _org_id AND metrics_date > current_date - 30
),
follow AS (
  SELECT jsonb_object_agg(status, n) AS obj
  FROM (SELECT status, COUNT(*) AS n FROM mkt_follow_campaign WHERE org_id = _org_id GROUP BY status) f
),

-- Work in flight
bd AS (
  SELECT jsonb_build_object(
           'by_grade', (SELECT jsonb_object_agg(COALESCE(grade, 'ungraded'), n)
                          FROM (SELECT grade, COUNT(*) n FROM bd_firms WHERE org_id = _org_id GROUP BY grade) g),
           'researched', (SELECT COUNT(*) FROM bd_firms WHERE org_id = _org_id AND researched_at IS NOT NULL),
           'drafts_pending', (SELECT COUNT(*) FROM bd_drafts WHERE org_id = _org_id AND status = 'pending'),
           'sequences_live', (SELECT COUNT(*) FROM bd_sequences WHERE org_id = _org_id AND stopped_at IS NULL)
         ) AS obj
),
tickets AS (
  SELECT jsonb_build_object(
           'open', COUNT(*) FILTER (WHERE status NOT IN ('closed', 'resolved')),
           'overdue', COUNT(*) FILTER (WHERE status NOT IN ('closed', 'resolved') AND due_at < now()),
           'resolved_30d', COUNT(*) FILTER (WHERE resolved_at > now() - interval '30 days'),
           'by_priority', (SELECT jsonb_object_agg(priority, n)
                             FROM (SELECT priority, COUNT(*) n FROM support_tickets
                                    WHERE org_id = _org_id AND status NOT IN ('closed', 'resolved')
                                    GROUP BY priority) p)
         ) AS obj
  FROM support_tickets WHERE org_id = _org_id
)
SELECT jsonb_build_object(
  'money',   COALESCE((SELECT rows FROM money), '[]'::jsonb),
  'social',  COALESCE((SELECT rows FROM social), '[]'::jsonb),
  'posts',   COALESCE((SELECT obj FROM posts), '{}'::jsonb),
  'ads',     COALESCE((SELECT obj FROM ads), '{}'::jsonb),
  'follow',  COALESCE((SELECT obj FROM follow), '{}'::jsonb),
  'bd',      COALESCE((SELECT obj FROM bd), '{}'::jsonb),
  'tickets', COALESCE((SELECT obj FROM tickets), '{}'::jsonb)
);
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_overview(uuid, integer) TO authenticated;
