-- Community Management API (In-Sync-Org app) tokens for posting as the
-- In-Sync company page. Member token columns stay as fallback.
ALTER TABLE mkt_linkedin_config
  ADD COLUMN IF NOT EXISTS org_access_token text,
  ADD COLUMN IF NOT EXISTS org_refresh_token text,
  ADD COLUMN IF NOT EXISTS org_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS org_refresh_expires_at timestamptz;
