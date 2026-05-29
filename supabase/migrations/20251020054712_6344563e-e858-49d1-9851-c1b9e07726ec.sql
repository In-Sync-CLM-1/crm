-- Phase 1A & 1B: Critical Schema Fixes and Unsubscribe System

-- 1. Add tracking columns to email_conversations
ALTER TABLE email_conversations 
ADD COLUMN IF NOT EXISTS tracking_pixel_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT UNIQUE;

-- 2. Fix cooldown race condition with unique constraint
ALTER TABLE email_automation_cooldowns
DROP CONSTRAINT IF EXISTS email_automation_cooldowns_rule_id_contact_id_key;

ALTER TABLE email_automation_cooldowns
ADD CONSTRAINT email_automation_cooldowns_rule_id_contact_id_key 
UNIQUE(rule_id, contact_id);

-- 3. Create atomic function for cooldown updates
CREATE OR REPLACE FUNCTION increment_automation_cooldown(
  _rule_id UUID,
  _contact_id UUID,
  _org_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO email_automation_cooldowns (
    rule_id, contact_id, org_id, last_sent_at, send_count
  )
  VALUES (_rule_id, _contact_id, _org_id, NOW(), 1)
  ON CONFLICT (rule_id, contact_id)
  DO UPDATE SET
    last_sent_at = NOW(),
    send_count = email_automation_cooldowns.send_count + 1;
END;
$$;

-- 4. Set default cooldown to 3 days
UPDATE email_automation_rules 
SET cooldown_period_days = 3 
WHERE cooldown_period_days IS NULL OR cooldown_period_days = 0;

ALTER TABLE email_automation_rules
ALTER COLUMN cooldown_period_days SET DEFAULT 3;

-- 5. Create daily send tracking table
CREATE TABLE email_automation_daily_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  send_date DATE NOT NULL DEFAULT CURRENT_DATE,
  email_count INTEGER NOT NULL DEFAULT 1,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, contact_id, send_date)
);

ALTER TABLE email_automation_daily_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view daily limits in their org"
ON email_automation_daily_limits FOR SELECT
TO authenticated
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Service role can manage daily limits"
ON email_automation_daily_limits FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX idx_daily_limits_org_contact_date 
ON email_automation_daily_limits(org_id, contact_id, send_date);

-- 6. Add global setting to organizations
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS max_automation_emails_per_day INTEGER DEFAULT 3;

-- 7. Function to check and increment daily limits
CREATE OR REPLACE FUNCTION check_and_increment_daily_limit(
  _org_id UUID,
  _contact_id UUID,
  _max_per_day INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_count INTEGER;
BEGIN
  -- Get or create today's record
  INSERT INTO email_automation_daily_limits (
    org_id, contact_id, send_date, email_count, last_sent_at
  )
  VALUES (_org_id, _contact_id, CURRENT_DATE, 0, NOW())
  ON CONFLICT (org_id, contact_id, send_date) DO NOTHING;

  -- Get current count with row lock
  SELECT email_count INTO current_count
  FROM email_automation_daily_limits
  WHERE org_id = _org_id 
    AND contact_id = _contact_id 
    AND send_date = CURRENT_DATE
  FOR UPDATE;

  -- Check if limit would be exceeded
  IF current_count >= _max_per_day THEN
    RETURN false;
  END IF;

  -- Increment count
  UPDATE email_automation_daily_limits
  SET email_count = email_count + 1,
      last_sent_at = NOW()
  WHERE org_id = _org_id 
    AND contact_id = _contact_id 
    AND send_date = CURRENT_DATE;

  RETURN true;
END;
$$;

-- 8. Create unsubscribe tracking table
CREATE TABLE email_unsubscribes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  unsubscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL,
  unsubscribe_token TEXT NOT NULL,
  user_agent TEXT,
  ip_address INET,
  UNIQUE(org_id, email)
);

ALTER TABLE email_unsubscribes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view unsubscribes in their org"
ON email_unsubscribes FOR SELECT
TO authenticated
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Service role can manage unsubscribes"
ON email_unsubscribes FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX idx_unsubscribes_org_email ON email_unsubscribes(org_id, LOWER(email));

-- 9. Function to check unsubscribe status
CREATE OR REPLACE FUNCTION is_email_unsubscribed(_org_id UUID, _email TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM email_unsubscribes
    WHERE org_id = _org_id AND LOWER(email) = LOWER(_email)
  );
$$;

-- 10. Add retry logic columns to executions
ALTER TABLE email_automation_executions
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;