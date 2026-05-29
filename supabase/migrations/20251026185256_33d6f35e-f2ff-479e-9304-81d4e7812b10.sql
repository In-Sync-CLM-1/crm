-- Create outbound_webhooks table
CREATE TABLE public.outbound_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  webhook_url TEXT NOT NULL,
  trigger_event TEXT NOT NULL CHECK (trigger_event IN (
    'contact_created',
    'contact_updated', 
    'stage_changed',
    'activity_logged',
    'disposition_set',
    'assignment_changed',
    'custom_field_updated'
  )),
  is_active BOOLEAN DEFAULT true,
  http_method TEXT DEFAULT 'POST' CHECK (http_method IN ('POST', 'PUT', 'PATCH')),
  headers JSONB DEFAULT '{}'::jsonb,
  payload_template JSONB DEFAULT '{}'::jsonb,
  filter_conditions JSONB DEFAULT '{}'::jsonb,
  retry_config JSONB DEFAULT '{"max_retries": 3, "retry_delay_seconds": 2}'::jsonb,
  authentication_type TEXT DEFAULT 'none' CHECK (authentication_type IN ('none', 'bearer', 'api_key', 'basic')),
  authentication_config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_outbound_webhooks_org_active ON public.outbound_webhooks(org_id, is_active);
CREATE INDEX idx_outbound_webhooks_trigger ON public.outbound_webhooks(trigger_event, is_active);

-- Create outbound_webhook_logs table
CREATE TABLE public.outbound_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES public.outbound_webhooks(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trigger_event TEXT NOT NULL,
  trigger_data JSONB NOT NULL,
  payload_sent JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  succeeded BOOLEAN DEFAULT false,
  execution_time_ms INTEGER
);

CREATE INDEX idx_outbound_webhook_logs_webhook ON public.outbound_webhook_logs(webhook_id);
CREATE INDEX idx_outbound_webhook_logs_org_sent ON public.outbound_webhook_logs(org_id, sent_at DESC);
CREATE INDEX idx_outbound_webhook_logs_succeeded ON public.outbound_webhook_logs(webhook_id, succeeded);

-- RLS Policies for outbound_webhooks
ALTER TABLE public.outbound_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view webhooks in their org"
  ON public.outbound_webhooks FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage webhooks"
  ON public.outbound_webhooks FOR ALL
  USING (
    org_id = get_user_org_id(auth.uid()) AND 
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  );

-- RLS Policies for outbound_webhook_logs
ALTER TABLE public.outbound_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view webhook logs in their org"
  ON public.outbound_webhook_logs FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Service role can manage webhook logs"
  ON public.outbound_webhook_logs FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create generic trigger function to call edge function
CREATE OR REPLACE FUNCTION public.trigger_outbound_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  trigger_event_name TEXT;
  trigger_data_json JSONB;
  target_org_id UUID;
BEGIN
  -- Determine event type from TG_ARGV
  trigger_event_name := TG_ARGV[0];
  
  -- Get org_id
  target_org_id := COALESCE(NEW.org_id, OLD.org_id);
  
  -- Build trigger data based on operation
  IF TG_OP = 'INSERT' THEN
    trigger_data_json := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    trigger_data_json := jsonb_build_object(
      'old', to_jsonb(OLD),
      'new', to_jsonb(NEW)
    );
  ELSIF TG_OP = 'DELETE' THEN
    trigger_data_json := to_jsonb(OLD);
  END IF;
  
  -- Call edge function asynchronously
  PERFORM net.http_post(
    url := 'https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/outbound-webhook-handler',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'orgId', target_org_id,
      'triggerEvent', trigger_event_name,
      'triggerData', trigger_data_json
    )
  );
  
  RETURN NEW;
END;
$$;

-- Attach triggers to contacts table
CREATE TRIGGER outbound_webhook_contact_created
AFTER INSERT ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION trigger_outbound_webhook('contact_created');

CREATE TRIGGER outbound_webhook_contact_updated
AFTER UPDATE ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION trigger_outbound_webhook('contact_updated');

CREATE TRIGGER outbound_webhook_stage_changed
AFTER UPDATE OF pipeline_stage_id ON public.contacts
FOR EACH ROW
WHEN (OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id)
EXECUTE FUNCTION trigger_outbound_webhook('stage_changed');

CREATE TRIGGER outbound_webhook_assignment_changed
AFTER UPDATE OF assigned_to ON public.contacts
FOR EACH ROW
WHEN (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
EXECUTE FUNCTION trigger_outbound_webhook('assignment_changed');

-- Attach triggers to contact_activities table
CREATE TRIGGER outbound_webhook_activity_logged
AFTER INSERT ON public.contact_activities
FOR EACH ROW
EXECUTE FUNCTION trigger_outbound_webhook('activity_logged');

CREATE TRIGGER outbound_webhook_disposition_set
AFTER UPDATE OF call_disposition_id ON public.contact_activities
FOR EACH ROW
WHEN (OLD.call_disposition_id IS DISTINCT FROM NEW.call_disposition_id)
EXECUTE FUNCTION trigger_outbound_webhook('disposition_set');