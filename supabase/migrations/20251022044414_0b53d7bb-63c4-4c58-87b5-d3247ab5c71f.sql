-- Fix function search path security warning
CREATE OR REPLACE FUNCTION public.trigger_auto_enrichment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_config JSONB;
  should_enrich BOOLEAN := false;
BEGIN
  -- Get organization's Apollo config
  SELECT apollo_config INTO org_config
  FROM public.organizations
  WHERE id = NEW.org_id;
  
  -- Check if auto-enrichment is enabled
  IF org_config IS NULL OR (org_config->>'auto_enrich_enabled')::boolean IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  
  -- Determine if we should enrich based on trigger type
  IF TG_OP = 'INSERT' THEN
    -- Check if enrich on create is enabled and contact has email
    should_enrich := (org_config->>'enrich_on_create')::boolean = true 
                     AND NEW.email IS NOT NULL 
                     AND NEW.email != '';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Check if enrich on email change is enabled and email actually changed
    should_enrich := (org_config->>'enrich_on_email_change')::boolean = true
                     AND OLD.email IS DISTINCT FROM NEW.email
                     AND NEW.email IS NOT NULL 
                     AND NEW.email != '';
  END IF;
  
  -- If should enrich, trigger the edge function
  IF should_enrich THEN
    PERFORM extensions.net.http_post(
      url := 'https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/enrich-contact',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('request.jwt.claims', true)::json->>'sub'
      ),
      body := jsonb_build_object(
        'contactId', NEW.id,
        'revealPhone', COALESCE((org_config->>'reveal_phone_by_default')::boolean, false),
        'revealPersonalEmail', COALESCE((org_config->>'reveal_email_by_default')::boolean, false)
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;