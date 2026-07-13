-- LinkedIn posting switches from organization-page auth (never approved) to
-- member (personal profile) auth. Token now lives in this table, refreshed by
-- mkt-linkedin-oauth-callback, instead of a static Supabase secret that expires
-- silently every ~60 days with no one noticing.

ALTER TABLE public.mkt_linkedin_config
  ADD COLUMN IF NOT EXISTS member_urn               TEXT,
  ADD COLUMN IF NOT EXISTS member_access_token       TEXT,
  ADD COLUMN IF NOT EXISTS member_token_expires_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS oauth_state               TEXT;
