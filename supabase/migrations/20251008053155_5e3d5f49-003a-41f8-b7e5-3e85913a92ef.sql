-- Drop existing trigger if any
DROP TRIGGER IF EXISTS auto_generate_webhook_token_trigger ON public.forms;

-- Create trigger to auto-generate webhook tokens
CREATE TRIGGER auto_generate_webhook_token_trigger
BEFORE INSERT ON public.forms
FOR EACH ROW
EXECUTE FUNCTION public.auto_generate_webhook_token();