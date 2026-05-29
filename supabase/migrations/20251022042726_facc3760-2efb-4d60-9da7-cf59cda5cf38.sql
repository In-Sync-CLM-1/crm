-- Add apollo_config column to organizations table
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS apollo_config JSONB DEFAULT '{
  "auto_enrich_enabled": false,
  "enrich_on_create": false,
  "enrich_on_email_change": false,
  "reveal_phone_by_default": false,
  "reveal_email_by_default": false
}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN organizations.apollo_config IS 'Configuration for Apollo.io data enrichment settings';