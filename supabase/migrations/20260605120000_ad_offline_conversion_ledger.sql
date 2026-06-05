-- Offline conversion feedback loop: extend the Google Ads feedback ledger so we
-- can record direct uploads to Google Ads (gclid -> conversion) independently of
-- the existing GA4 push. A qualified lead in the CRM is fed back to Google Ads so
-- bidding learns which clicks become genuine business, not just form fills.

ALTER TABLE public.mkt_google_ads_feedback
  ADD COLUMN IF NOT EXISTS pushed_to_google_ads     boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pushed_to_google_ads_at  timestamptz,
  ADD COLUMN IF NOT EXISTS google_ads_push_error    text;

-- Idempotency: one feedback row per (lead, conversion type). Full (non-partial)
-- unique index so the uploader's ON CONFLICT (lead_id, conversion_type) upsert
-- can target it. Rows with NULL lead_id (legacy GA4-only rows) stay unconstrained
-- because NULLs are distinct under a default unique index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mkt_feedback_lead_conversion
  ON public.mkt_google_ads_feedback (lead_id, conversion_type);

-- Pull index for the uploader: rows captured but not yet sent to Google Ads.
CREATE INDEX IF NOT EXISTS idx_mkt_feedback_unpushed_google_ads
  ON public.mkt_google_ads_feedback (pushed_to_google_ads)
  WHERE pushed_to_google_ads = false;
