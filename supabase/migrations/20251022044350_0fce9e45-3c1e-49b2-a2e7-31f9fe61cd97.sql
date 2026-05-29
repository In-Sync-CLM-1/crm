-- Create function to handle auto-enrichment triggers
CREATE OR REPLACE FUNCTION public.trigger_auto_enrichment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  org_config JSONB;
  should_enrich BOOLEAN := false;
BEGIN
  -- Get organization's Apollo config
  SELECT apollo_config INTO org_config
  FROM organizations
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
    PERFORM net.http_post(
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

-- Create trigger for INSERT (new contacts)
DROP TRIGGER IF EXISTS trigger_contact_auto_enrich_insert ON public.contacts;
CREATE TRIGGER trigger_contact_auto_enrich_insert
  AFTER INSERT ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_auto_enrichment();

-- Create trigger for UPDATE (email changes)
DROP TRIGGER IF EXISTS trigger_contact_auto_enrich_update ON public.contacts;
CREATE TRIGGER trigger_contact_auto_enrich_update
  AFTER UPDATE ON public.contacts
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.trigger_auto_enrichment();