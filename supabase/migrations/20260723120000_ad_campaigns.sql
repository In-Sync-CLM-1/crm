-- Autonomous paid-ads engine (2026-07-23): the AI generates, launches, and
-- retires real Google Ads / Meta Ads campaigns on its own, gated ONLY by a
-- human-set budget ceiling (mkt_engine_config config_key='paid_ads_budget').
-- Mirrors the organic engine's shape (see blog_posts) but for paid spend —
-- product_key/content_strategy_note carry the same meaning here.
CREATE TABLE IF NOT EXISTS public.mkt_ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('google', 'meta')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'paused')),
  product_key text,
  name text NOT NULL,
  content_strategy_note text,

  -- Google Ads copy
  headlines jsonb,
  descriptions jsonb,
  keywords jsonb,

  -- Meta copy
  primary_text text,
  meta_headline text,

  -- Shared creative
  image_url text,
  video_url text,
  image_source text CHECK (image_source IN ('ai', 'uploaded')),
  video_source text CHECK (video_source IN ('ai', 'uploaded')),

  -- Mandatory spend/schedule fields (per Amit's requirement)
  daily_budget numeric NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  launch_date date NOT NULL,
  duration_days int NOT NULL,
  end_date date NOT NULL,

  -- Platform resource ids, populated once launched
  google_customer_id text,
  google_campaign_id text,
  google_budget_id text,
  google_ad_group_id text,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,

  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mkt_ad_campaigns_org_channel_status ON public.mkt_ad_campaigns (org_id, channel, status);

ALTER TABLE public.mkt_ad_campaigns ENABLE ROW LEVEL SECURITY;
