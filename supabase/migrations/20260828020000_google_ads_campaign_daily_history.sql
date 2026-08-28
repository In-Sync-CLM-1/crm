CREATE TABLE IF NOT EXISTS mkt_google_ads_campaign_metrics_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  google_campaign_id text NOT NULL,
  metrics_date date NOT NULL,
  impressions bigint DEFAULT 0,
  clicks bigint DEFAULT 0,
  cost numeric(12,2) DEFAULT 0,
  conversions numeric(10,2) DEFAULT 0,
  conversion_value numeric(12,2) DEFAULT 0,
  ctr numeric(8,4) DEFAULT 0,
  avg_cpc numeric(8,2) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, google_campaign_id, metrics_date)
);

CREATE INDEX IF NOT EXISTS idx_mkt_google_ads_campaign_metrics_daily_lookup
  ON mkt_google_ads_campaign_metrics_daily (org_id, google_campaign_id, metrics_date DESC);

ALTER TABLE mkt_google_ads_campaign_metrics_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view mkt_google_ads_campaign_metrics_daily in their org" ON mkt_google_ads_campaign_metrics_daily;
CREATE POLICY "Users can view mkt_google_ads_campaign_metrics_daily in their org"
  ON mkt_google_ads_campaign_metrics_daily
  FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));
