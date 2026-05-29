-- Add target table and operation columns
ALTER TABLE outbound_webhooks
ADD COLUMN IF NOT EXISTS target_table TEXT NOT NULL DEFAULT 'contacts',
ADD COLUMN IF NOT EXISTS target_operation TEXT NOT NULL DEFAULT 'INSERT',
ADD COLUMN IF NOT EXISTS total_executions INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_failures INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_executed_at TIMESTAMPTZ;

-- Remove CHECK constraint on trigger_event (we'll generate it dynamically)
ALTER TABLE outbound_webhooks 
DROP CONSTRAINT IF EXISTS outbound_webhooks_trigger_event_check;

-- Create generic trigger function for any table
CREATE OR REPLACE FUNCTION trigger_outbound_webhook_generic()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  trigger_data_json JSONB;
  target_org_id UUID;
  operation_name TEXT;
BEGIN
  -- Get org_id (must exist in the row)
  target_org_id := COALESCE(NEW.org_id, OLD.org_id);
  
  -- Build event name and data based on operation
  IF TG_OP = 'INSERT' THEN
    operation_name := TG_TABLE_NAME || '_created';
    trigger_data_json := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    operation_name := TG_TABLE_NAME || '_updated';
    trigger_data_json := jsonb_build_object(
      'old', to_jsonb(OLD),
      'new', to_jsonb(NEW)
    );
  ELSIF TG_OP = 'DELETE' THEN
    operation_name := TG_TABLE_NAME || '_deleted';
    trigger_data_json := to_jsonb(OLD);
  END IF;
  
  -- Call edge function
  PERFORM net.http_post(
    url := 'https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/outbound-webhook-handler',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'orgId', target_org_id,
      'triggerEvent', operation_name,
      'triggerData', trigger_data_json,
      'tableName', TG_TABLE_NAME,
      'operation', TG_OP
    )
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create function to manage triggers dynamically
CREATE OR REPLACE FUNCTION manage_webhook_trigger(
  p_table_name TEXT,
  p_operation TEXT,
  p_action TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  trigger_name TEXT;
  sql_statement TEXT;
BEGIN
  -- Generate unique trigger name
  trigger_name := 'webhook_' || p_table_name || '_' || lower(p_operation);
  
  IF p_action = 'create' THEN
    -- Drop existing trigger first
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_name, p_table_name);
    
    -- Create trigger
    sql_statement := format(
      'CREATE TRIGGER %I AFTER %s ON public.%I FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic()',
      trigger_name,
      p_operation,
      p_table_name
    );
    EXECUTE sql_statement;
  ELSIF p_action = 'drop' THEN
    -- Drop trigger if exists
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_name, p_table_name);
  END IF;
END;
$$;