-- Fix search_path for generate_webhook_token function
CREATE OR REPLACE FUNCTION public.generate_webhook_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  token TEXT;
  token_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate token with format: wh_<random 32 chars>
    token := 'wh_' || encode(gen_random_bytes(24), 'hex');
    
    -- Check if token already exists
    SELECT EXISTS(SELECT 1 FROM forms WHERE webhook_token = token) INTO token_exists;
    
    -- Exit loop if unique
    EXIT WHEN NOT token_exists;
  END LOOP;
  
  RETURN token;
END;
$function$;

-- Fix search_path for auto_generate_webhook_token trigger function
CREATE OR REPLACE FUNCTION public.auto_generate_webhook_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.connector_type = 'webhook' AND NEW.webhook_token IS NULL THEN
    NEW.webhook_token := generate_webhook_token();
  END IF;
  RETURN NEW;
END;
$function$;