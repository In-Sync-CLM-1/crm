-- Ensure pgcrypto extension is enabled (it creates gen_random_bytes globally)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Recreate the generate_webhook_token function
CREATE OR REPLACE FUNCTION public.generate_webhook_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

-- Recreate the auto_generate_webhook_token trigger function
CREATE OR REPLACE FUNCTION public.auto_generate_webhook_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.connector_type = 'webhook' AND NEW.webhook_token IS NULL THEN
    NEW.webhook_token := generate_webhook_token();
  END IF;
  RETURN NEW;
END;
$$;

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS auto_generate_webhook_token_trigger ON public.forms;

CREATE TRIGGER auto_generate_webhook_token_trigger
  BEFORE INSERT ON public.forms
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_webhook_token();