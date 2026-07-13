-- Facebook Page + linked Instagram Business account config, mirroring
-- mkt_linkedin_config. Populated by mkt-facebook-oauth-callback. Facebook
-- long-lived Page tokens don't expire on a fixed schedule (unlike LinkedIn's
-- ~60 days), so no expiry tracking is needed here.

CREATE TABLE IF NOT EXISTS public.mkt_social_config (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  fb_page_id            TEXT,
  fb_page_name          TEXT,
  fb_page_access_token  TEXT,
  ig_user_id            TEXT,
  active                BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mkt_social_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on mkt_social_config"
  ON public.mkt_social_config FOR ALL
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_mkt_social_config_updated_at
  BEFORE UPDATE ON public.mkt_social_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
