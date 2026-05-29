-- Phase 1: Core Email Automation Infrastructure
-- Tables for rule-based email automation engine

-- Create email_automation_rules table
CREATE TABLE email_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  
  -- Rule Metadata
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  
  -- Trigger Configuration (Phase 1: stage_change, disposition_set)
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('stage_change', 'disposition_set')),
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Conditions (Advanced Filtering)
  condition_logic TEXT DEFAULT 'AND' CHECK (condition_logic IN ('AND', 'OR')),
  conditions JSONB DEFAULT '[]'::jsonb,
  
  -- Template & Timing
  email_template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  send_delay_minutes INTEGER DEFAULT 0 CHECK (send_delay_minutes >= 0),
  
  -- Scheduling & Frequency Control
  max_sends_per_contact INTEGER CHECK (max_sends_per_contact IS NULL OR max_sends_per_contact > 0),
  cooldown_period_days INTEGER CHECK (cooldown_period_days IS NULL OR cooldown_period_days > 0),
  
  -- Priority & Conflict Resolution
  priority INTEGER DEFAULT 50 CHECK (priority >= 0 AND priority <= 100),
  
  -- Analytics
  total_triggered INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0,
  
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rules_org_active ON email_automation_rules(org_id, is_active);
CREATE INDEX idx_rules_trigger_type ON email_automation_rules(trigger_type);

-- Enable RLS
ALTER TABLE email_automation_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for email_automation_rules
CREATE POLICY "Users can view rules in their org"
ON email_automation_rules FOR SELECT
TO authenticated
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage rules in their org"
ON email_automation_rules FOR ALL
TO authenticated
USING (
  org_id = get_user_org_id(auth.uid()) AND
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
);

-- Create email_automation_executions table
CREATE TABLE email_automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  rule_id UUID REFERENCES email_automation_rules(id) ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  
  -- Execution Details
  trigger_type TEXT NOT NULL,
  trigger_data JSONB DEFAULT '{}'::jsonb,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'sent', 'failed', 'skipped')),
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  
  -- Email Details
  email_template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  email_subject TEXT,
  email_conversation_id UUID REFERENCES email_conversations(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_executions_org ON email_automation_executions(org_id);
CREATE INDEX idx_executions_rule ON email_automation_executions(rule_id);
CREATE INDEX idx_executions_contact ON email_automation_executions(contact_id);
CREATE INDEX idx_executions_status ON email_automation_executions(status);
CREATE INDEX idx_executions_scheduled ON email_automation_executions(scheduled_for) WHERE status = 'scheduled';

-- Enable RLS
ALTER TABLE email_automation_executions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for email_automation_executions
CREATE POLICY "Users can view executions in their org"
ON email_automation_executions FOR SELECT
TO authenticated
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Service role can manage all executions"
ON email_automation_executions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Create email_automation_cooldowns table
CREATE TABLE email_automation_cooldowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  rule_id UUID REFERENCES email_automation_rules(id) ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL,
  send_count INTEGER DEFAULT 1,
  
  UNIQUE(rule_id, contact_id)
);

CREATE INDEX idx_cooldowns_rule_contact ON email_automation_cooldowns(rule_id, contact_id);

-- Enable RLS
ALTER TABLE email_automation_cooldowns ENABLE ROW LEVEL SECURITY;

-- RLS Policies for email_automation_cooldowns
CREATE POLICY "Users can view cooldowns in their org"
ON email_automation_cooldowns FOR SELECT
TO authenticated
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Service role can manage all cooldowns"
ON email_automation_cooldowns FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Update trigger for updated_at columns
CREATE TRIGGER update_email_automation_rules_updated_at
BEFORE UPDATE ON email_automation_rules
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_automation_executions_updated_at
BEFORE UPDATE ON email_automation_executions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Helper function to increment automation rule stats
CREATE OR REPLACE FUNCTION increment_automation_rule_stats(
  _rule_id UUID,
  _stat_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _stat_type = 'triggered' THEN
    UPDATE email_automation_rules
    SET total_triggered = total_triggered + 1
    WHERE id = _rule_id;
  ELSIF _stat_type = 'sent' THEN
    UPDATE email_automation_rules
    SET total_sent = total_sent + 1
    WHERE id = _rule_id;
  ELSIF _stat_type = 'failed' THEN
    UPDATE email_automation_rules
    SET total_failed = total_failed + 1
    WHERE id = _rule_id;
  END IF;
END;
$$;

-- Database trigger functions for automation detection (Phase 1: stage_change only)
CREATE OR REPLACE FUNCTION trigger_stage_change_automation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Only trigger if pipeline_stage_id actually changed
  IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
    PERFORM net.http_post(
      url := 'https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/automation-trigger-handler',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('request.headers')::json->>'authorization' || '"}'::jsonb,
      body := jsonb_build_object(
        'orgId', NEW.org_id,
        'triggerType', 'stage_change',
        'contactId', NEW.id,
        'triggerData', jsonb_build_object(
          'from_stage_id', OLD.pipeline_stage_id,
          'to_stage_id', NEW.pipeline_stage_id
        )
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger to contacts table
CREATE TRIGGER automation_stage_change
AFTER UPDATE ON contacts
FOR EACH ROW
EXECUTE FUNCTION trigger_stage_change_automation();

-- Database trigger for disposition set (Phase 1)
CREATE OR REPLACE FUNCTION trigger_disposition_set_automation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Trigger when disposition is set (either INSERT with disposition or UPDATE changing disposition)
  IF (TG_OP = 'INSERT' AND NEW.call_disposition_id IS NOT NULL) OR
     (TG_OP = 'UPDATE' AND OLD.call_disposition_id IS DISTINCT FROM NEW.call_disposition_id AND NEW.call_disposition_id IS NOT NULL) THEN
    PERFORM net.http_post(
      url := 'https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/automation-trigger-handler',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('request.headers')::json->>'authorization' || '"}'::jsonb,
      body := jsonb_build_object(
        'orgId', NEW.org_id,
        'triggerType', 'disposition_set',
        'contactId', NEW.contact_id,
        'triggerData', jsonb_build_object(
          'activity_id', NEW.id,
          'activity_type', NEW.activity_type,
          'disposition_id', NEW.call_disposition_id,
          'sub_disposition_id', NEW.call_sub_disposition_id,
          'subject', NEW.subject
        )
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger to contact_activities table
CREATE TRIGGER automation_disposition_set
AFTER INSERT OR UPDATE ON contact_activities
FOR EACH ROW
EXECUTE FUNCTION trigger_disposition_set_automation();