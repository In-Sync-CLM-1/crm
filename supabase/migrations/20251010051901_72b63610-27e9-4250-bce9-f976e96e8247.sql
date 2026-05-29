-- Add custom_data and variable_mappings columns to campaign tables

-- WhatsApp campaign recipients: store CSV-uploaded custom data per recipient
ALTER TABLE whatsapp_campaign_recipients 
ADD COLUMN IF NOT EXISTS custom_data JSONB DEFAULT '{}'::jsonb;

-- Email campaign recipients: store CSV-uploaded custom data per recipient
ALTER TABLE email_campaign_recipients 
ADD COLUMN IF NOT EXISTS custom_data JSONB DEFAULT '{}'::jsonb;

-- WhatsApp campaigns: store variable mapping configuration
ALTER TABLE whatsapp_bulk_campaigns 
ADD COLUMN IF NOT EXISTS variable_mappings JSONB DEFAULT '{}'::jsonb;

-- Email campaigns: store variable mapping configuration
ALTER TABLE email_bulk_campaigns 
ADD COLUMN IF NOT EXISTS variable_mappings JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN whatsapp_campaign_recipients.custom_data IS 'Stores row-specific data from CSV upload for this recipient';
COMMENT ON COLUMN email_campaign_recipients.custom_data IS 'Stores row-specific data from CSV upload for this recipient';
COMMENT ON COLUMN whatsapp_bulk_campaigns.variable_mappings IS 'Maps template variables to data sources (CRM field, CSV column, or static value)';
COMMENT ON COLUMN email_bulk_campaigns.variable_mappings IS 'Maps template variables to data sources (CRM field, CSV column, or static value)';