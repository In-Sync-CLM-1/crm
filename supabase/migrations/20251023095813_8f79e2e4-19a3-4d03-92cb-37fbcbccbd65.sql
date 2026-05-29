-- Fix trigger_disposition_set_automation function to remove problematic authorization header extraction
CREATE OR REPLACE FUNCTION public.trigger_disposition_set_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- Trigger when disposition is set (either INSERT with disposition or UPDATE changing disposition)
  IF (TG_OP = 'INSERT' AND NEW.call_disposition_id IS NOT NULL) OR
     (TG_OP = 'UPDATE' AND OLD.call_disposition_id IS DISTINCT FROM NEW.call_disposition_id AND NEW.call_disposition_id IS NOT NULL) THEN
    PERFORM net.http_post(
      url := 'https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/automation-trigger-handler',
      headers := '{"Content-Type": "application/json"}'::jsonb,
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
$function$;