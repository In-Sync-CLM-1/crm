-- Phase 1: Database Foundation for Webhook Connectors

-- 1. Extend forms table to support webhook connectors
ALTER TABLE forms 
  ADD COLUMN connector_type TEXT DEFAULT 'manual' CHECK (connector_type IN ('manual', 'public_form', 'webhook')),
  ADD COLUMN webhook_token TEXT UNIQUE,
  ADD COLUMN webhook_config JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN rate_limit_per_minute INTEGER DEFAULT 60;

-- Create index for webhook token lookups
CREATE INDEX idx_forms_webhook_token ON forms(webhook_token) WHERE webhook_token IS NOT NULL;

-- 2. Create connector_logs table for webhook activity tracking
CREATE TABLE connector_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID REFERENCES forms(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  request_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'duplicate', 'error')),
  http_status_code INTEGER NOT NULL,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB DEFAULT '{}'::jsonb,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  error_message TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for connector_logs
CREATE INDEX idx_connector_logs_form ON connector_logs(form_id);
CREATE INDEX idx_connector_logs_org ON connector_logs(org_id);
CREATE INDEX idx_connector_logs_created ON connector_logs(created_at DESC);
CREATE INDEX idx_connector_logs_status ON connector_logs(status);

-- 3. Add composite unique constraint to contacts for duplicate detection
ALTER TABLE contacts 
  ADD CONSTRAINT unique_phone_per_org UNIQUE (org_id, phone) DEFERRABLE INITIALLY DEFERRED;

-- 4. Enable RLS on connector_logs
ALTER TABLE connector_logs ENABLE ROW LEVEL SECURITY;

-- Users can view logs in their org
CREATE POLICY "Users can view logs in their org"
  ON connector_logs FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

-- Service role has full access (for edge functions)
CREATE POLICY "Service role has full access to connector_logs"
  ON connector_logs FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- 5. Helper function: Check rate limit for webhook connectors
CREATE OR REPLACE FUNCTION check_connector_rate_limit(
  _form_id UUID,
  _limit INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  recent_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM connector_logs
  WHERE form_id = _form_id
    AND created_at > NOW() - INTERVAL '1 minute';
  
  RETURN recent_count < _limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 6. Helper function: Generate webhook token
CREATE OR REPLACE FUNCTION generate_webhook_token()
RETURNS TEXT AS $$
DECLARE
  token TEXT;
  exists BOOLEAN;
BEGIN
  LOOP
    -- Generate token with format: wh_<random 32 chars>
    token := 'wh_' || encode(gen_random_bytes(24), 'hex');
    
    -- Check if token already exists
    SELECT EXISTS(SELECT 1 FROM forms WHERE webhook_token = token) INTO exists;
    
    -- Exit loop if unique
    EXIT WHEN NOT exists;
  END LOOP;
  
  RETURN token;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public;

-- 7. Add trigger to auto-generate webhook token when connector_type is 'webhook'
CREATE OR REPLACE FUNCTION auto_generate_webhook_token()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.connector_type = 'webhook' AND NEW.webhook_token IS NULL THEN
    NEW.webhook_token := generate_webhook_token();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_auto_webhook_token
  BEFORE INSERT OR UPDATE ON forms
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_webhook_token();