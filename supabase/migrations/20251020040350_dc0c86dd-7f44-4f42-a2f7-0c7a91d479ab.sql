-- Phase 2: Advanced Trigger Types
-- Add new trigger types to existing email_automation_rules table

-- Update trigger_type constraint to include new types
ALTER TABLE email_automation_rules 
DROP CONSTRAINT IF EXISTS email_automation_rules_trigger_type_check;

ALTER TABLE email_automation_rules
ADD CONSTRAINT email_automation_rules_trigger_type_check 
CHECK (trigger_type IN (
  'stage_change', 
  'disposition_set', 
  'activity_logged', 
  'field_updated', 
  'inactivity', 
  'time_based', 
  'assignment_changed'
));

-- Add fields for time-based triggers
ALTER TABLE email_automation_rules
ADD COLUMN IF NOT EXISTS send_at_specific_time TIME,
ADD COLUMN IF NOT EXISTS send_on_business_days_only BOOLEAN DEFAULT false;

-- Database trigger for activity logged
CREATE OR REPLACE FUNCTION trigger_activity_logged_automation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/automation-trigger-handler',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'orgId', NEW.org_id,
      'triggerType', 'activity_logged',
      'contactId', NEW.contact_id,
      'triggerData', jsonb_build_object(
        'activity_id', NEW.id,
        'activity_type', NEW.activity_type,
        'subject', NEW.subject,
        'description', NEW.description,
        'call_duration', NEW.call_duration,
        'meeting_duration_minutes', NEW.meeting_duration_minutes
      )
    )
  );
  RETURN NEW;
END;
$$;

-- Attach activity logged trigger
DROP TRIGGER IF EXISTS automation_activity_logged ON contact_activities;
CREATE TRIGGER automation_activity_logged
AFTER INSERT ON contact_activities
FOR EACH ROW
EXECUTE FUNCTION trigger_activity_logged_automation();

-- Database trigger for custom field updates
CREATE OR REPLACE FUNCTION trigger_field_updated_automation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF OLD.field_value IS DISTINCT FROM NEW.field_value THEN
    PERFORM net.http_post(
      url := 'https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/automation-trigger-handler',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'orgId', (SELECT org_id FROM contacts WHERE id = NEW.contact_id),
        'triggerType', 'field_updated',
        'contactId', NEW.contact_id,
        'triggerData', jsonb_build_object(
          'custom_field_id', NEW.custom_field_id,
          'field_id', NEW.custom_field_id,
          'old_value', OLD.field_value,
          'new_value', NEW.field_value
        )
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Attach field updated trigger
DROP TRIGGER IF EXISTS automation_field_updated ON contact_custom_fields;
CREATE TRIGGER automation_field_updated
AFTER UPDATE ON contact_custom_fields
FOR EACH ROW
EXECUTE FUNCTION trigger_field_updated_automation();

-- Database trigger for assignment changes
CREATE OR REPLACE FUNCTION trigger_assignment_changed_automation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to OR 
     OLD.assigned_team_id IS DISTINCT FROM NEW.assigned_team_id THEN
    PERFORM net.http_post(
      url := 'https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/automation-trigger-handler',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'orgId', NEW.org_id,
        'triggerType', 'assignment_changed',
        'contactId', NEW.id,
        'triggerData', jsonb_build_object(
          'old_user_id', OLD.assigned_to,
          'new_user_id', NEW.assigned_to,
          'old_team_id', OLD.assigned_team_id,
          'new_team_id', NEW.assigned_team_id
        )
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Attach assignment changed trigger (update existing trigger)
DROP TRIGGER IF EXISTS automation_assignment_changed ON contacts;
CREATE TRIGGER automation_assignment_changed
AFTER UPDATE ON contacts
FOR EACH ROW
EXECUTE FUNCTION trigger_assignment_changed_automation();

-- Create function to detect inactive contacts
CREATE OR REPLACE FUNCTION check_inactive_contacts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  rule_record RECORD;
  contact_record RECORD;
  last_activity_date TIMESTAMPTZ;
  days_inactive INTEGER;
BEGIN
  -- Loop through all active inactivity rules
  FOR rule_record IN 
    SELECT * FROM email_automation_rules 
    WHERE trigger_type = 'inactivity' 
    AND is_active = true
  LOOP
    -- Get inactivity threshold from config
    days_inactive := COALESCE((rule_record.trigger_config->>'inactivity_days')::INTEGER, 30);
    
    -- Find contacts in this org that haven't had activity in X days
    FOR contact_record IN
      SELECT c.id, c.org_id,
             MAX(ca.created_at) as last_activity
      FROM contacts c
      LEFT JOIN contact_activities ca ON ca.contact_id = c.id
      WHERE c.org_id = rule_record.org_id
      GROUP BY c.id, c.org_id
      HAVING MAX(ca.created_at) < NOW() - (days_inactive || ' days')::INTERVAL
         OR MAX(ca.created_at) IS NULL
    LOOP
      -- Trigger automation for this contact
      PERFORM net.http_post(
        url := 'https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/automation-trigger-handler',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'orgId', contact_record.org_id,
          'triggerType', 'inactivity',
          'contactId', contact_record.id,
          'triggerData', jsonb_build_object(
            'days_inactive', days_inactive,
            'last_activity', contact_record.last_activity
          )
        )
      );
    END LOOP;
  END LOOP;
END;
$$;

-- Schedule inactivity checker to run daily at 9 AM
SELECT cron.schedule(
  'check-inactive-contacts',
  '0 9 * * *', -- Daily at 9 AM
  $$
  SELECT check_inactive_contacts();
  $$
);

-- Create function to process time-based triggers
CREATE OR REPLACE FUNCTION process_time_based_triggers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  rule_record RECORD;
  contact_record RECORD;
  trigger_date TIMESTAMPTZ;
  relative_days INTEGER;
BEGIN
  -- Loop through all active time-based rules
  FOR rule_record IN 
    SELECT * FROM email_automation_rules 
    WHERE trigger_type = 'time_based' 
    AND is_active = true
  LOOP
    relative_days := COALESCE((rule_record.trigger_config->>'relative_days')::INTEGER, 0);
    
    -- Check contacts that match the time criteria
    IF rule_record.trigger_config->>'trigger_date_type' = 'contact_created' THEN
      FOR contact_record IN
        SELECT id, org_id, created_at
        FROM contacts
        WHERE org_id = rule_record.org_id
        AND DATE(created_at + (relative_days || ' days')::INTERVAL) = CURRENT_DATE
      LOOP
        PERFORM net.http_post(
          url := 'https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/automation-trigger-handler',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body := jsonb_build_object(
            'orgId', contact_record.org_id,
            'triggerType', 'time_based',
            'contactId', contact_record.id,
            'triggerData', jsonb_build_object(
              'trigger_date_type', 'contact_created',
              'relative_days', relative_days,
              'contact_created_at', contact_record.created_at
            )
          )
        );
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

-- Schedule time-based trigger processor to run daily at 8 AM
SELECT cron.schedule(
  'process-time-based-triggers',
  '0 8 * * *', -- Daily at 8 AM
  $$
  SELECT process_time_based_triggers();
  $$
);