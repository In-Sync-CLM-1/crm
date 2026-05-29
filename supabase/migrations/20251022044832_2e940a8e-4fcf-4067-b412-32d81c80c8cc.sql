-- Fix parameter name mismatch in trigger_auto_enrichment function
CREATE OR REPLACE FUNCTION public.trigger_auto_enrichment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_config JSONB;
  v_auto_enrich_enabled BOOLEAN;
  v_enrich_on_create BOOLEAN;
  v_enrich_on_email_change BOOLEAN;
  v_reveal_phone BOOLEAN;
  v_reveal_email BOOLEAN;
  v_should_enrich BOOLEAN := false;
BEGIN
  -- Get apollo_config from organizations table
  SELECT apollo_config INTO v_config
  FROM organizations
  WHERE id = NEW.org_id;

  -- Extract configuration values
  v_auto_enrich_enabled := COALESCE((v_config->>'autoEnrichEnabled')::boolean, false);
  v_enrich_on_create := COALESCE((v_config->>'enrichOnCreate')::boolean, false);
  v_enrich_on_email_change := COALESCE((v_config->>'enrichOnEmailChange')::boolean, false);
  v_reveal_phone := COALESCE((v_config->>'defaultRevealPhone')::boolean, false);
  v_reveal_email := COALESCE((v_config->>'defaultRevealEmail')::boolean, false);

  -- Check if auto-enrichment is enabled
  IF NOT v_auto_enrich_enabled THEN
    RETURN NEW;
  END IF;

  -- Determine if we should enrich
  IF TG_OP = 'INSERT' AND v_enrich_on_create AND NEW.email IS NOT NULL THEN
    v_should_enrich := true;
  ELSIF TG_OP = 'UPDATE' AND v_enrich_on_email_change 
    AND OLD.email IS DISTINCT FROM NEW.email 
    AND NEW.email IS NOT NULL THEN
    v_should_enrich := true;
  END IF;

  -- Trigger enrichment if conditions are met
  IF v_should_enrich THEN
    PERFORM extensions.net.http_post(
      url := 'https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/enrich-contact',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpemdweGFxdnR2dnFhcnpqbXplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2MTcwNzYsImV4cCI6MjA3NTE5MzA3Nn0.eBLy2zBEiZoLiDXFpLupi7bUOaOk4XNJo_wEIiLuLpE'
      ),
      body := jsonb_build_object(
        'contactId', NEW.id,
        'revealPhoneNumber', v_reveal_phone,
        'revealPersonalEmail', v_reveal_email
      )
    );
  END IF;

  RETURN NEW;
END;
$function$;