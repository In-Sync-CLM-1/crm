-- Phase 2: Enhanced Analytics and Email Engagement Triggers

-- 1. Add conversion tracking to executions
ALTER TABLE email_automation_executions
ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS conversion_value NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS conversion_type TEXT;

-- 2. Function to mark conversions
CREATE OR REPLACE FUNCTION mark_automation_conversion(
  _execution_id UUID,
  _conversion_type TEXT,
  _conversion_value NUMERIC DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE email_automation_executions
  SET converted_at = NOW(),
      conversion_type = _conversion_type,
      conversion_value = _conversion_value
  WHERE id = _execution_id AND converted_at IS NULL;
END;
$$;

-- 3. Auto-mark conversions when deal is won
CREATE OR REPLACE FUNCTION auto_mark_automation_conversions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  won_stage_id UUID;
BEGIN
  -- Only proceed if stage changed to "Won"
  IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
    SELECT id INTO won_stage_id
    FROM pipeline_stages
    WHERE org_id = NEW.org_id AND LOWER(name) = 'won'
    LIMIT 1;

    IF NEW.pipeline_stage_id = won_stage_id THEN
      -- Mark recent executions (within 30 days) as converted
      UPDATE email_automation_executions
      SET converted_at = NOW(),
          conversion_type = 'deal_won',
          conversion_value = 0
      WHERE contact_id = NEW.id
        AND status = 'sent'
        AND sent_at >= NOW() - INTERVAL '30 days'
        AND converted_at IS NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER mark_conversions_on_deal_won
AFTER UPDATE ON contacts
FOR EACH ROW
EXECUTE FUNCTION auto_mark_automation_conversions();

-- 4. Create email engagement trigger function
CREATE OR REPLACE FUNCTION trigger_email_engagement_automation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  supabase_url TEXT;
BEGIN
  supabase_url := 'https://aizgpxaqvtvvqarzjmze.supabase.co';

  -- Trigger on first open
  IF OLD.opened_at IS NULL AND NEW.opened_at IS NOT NULL THEN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/automation-trigger-handler',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'orgId', NEW.org_id,
        'triggerType', 'email_engagement',
        'contactId', NEW.contact_id,
        'triggerData', jsonb_build_object(
          'engagement_type', 'opened',
          'email_id', NEW.id,
          'conversation_id', NEW.conversation_id,
          'opened_at', NEW.opened_at
        )
      )
    );
  END IF;

  -- Trigger on first click
  IF OLD.first_clicked_at IS NULL AND NEW.first_clicked_at IS NOT NULL THEN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/automation-trigger-handler',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'orgId', NEW.org_id,
        'triggerType', 'email_engagement',
        'contactId', NEW.contact_id,
        'triggerData', jsonb_build_object(
          'engagement_type', 'clicked',
          'email_id', NEW.id,
          'conversation_id', NEW.conversation_id,
          'clicked_at', NEW.first_clicked_at
        )
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER email_engagement_trigger
AFTER UPDATE ON email_conversations
FOR EACH ROW
WHEN (
  (OLD.opened_at IS NULL AND NEW.opened_at IS NOT NULL) OR
  (OLD.first_clicked_at IS NULL AND NEW.first_clicked_at IS NOT NULL)
)
EXECUTE FUNCTION trigger_email_engagement_automation();