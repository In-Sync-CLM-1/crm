-- Fix the trigger function to properly call http_post
CREATE OR REPLACE FUNCTION public.trigger_stage_change_automation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  auth_header TEXT;
BEGIN
  -- Only trigger if pipeline_stage_id actually changed
  IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
    -- Safely get authorization header, default to empty if not available
    BEGIN
      auth_header := COALESCE(
        current_setting('request.headers', true)::json->>'authorization',
        ''
      );
    EXCEPTION WHEN OTHERS THEN
      auth_header := '';
    END;
    
    PERFORM net.http_post(
      url := 'https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/automation-trigger-handler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', CASE WHEN auth_header != '' THEN 'Bearer ' || auth_header ELSE '' END
      ),
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
$function$;