-- Create api_keys table for managing external API access
CREATE TABLE public.api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key_name TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{"endpoints": []}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create api_key_usage_logs table for tracking API usage
CREATE TABLE public.api_key_usage_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_time_ms INTEGER,
  ip_address INET,
  user_agent TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX idx_api_keys_org_id ON public.api_keys(org_id);
CREATE INDEX idx_api_keys_api_key ON public.api_keys(api_key) WHERE is_active = true;
CREATE INDEX idx_api_key_usage_logs_api_key_id ON public.api_key_usage_logs(api_key_id);
CREATE INDEX idx_api_key_usage_logs_org_id ON public.api_key_usage_logs(org_id);
CREATE INDEX idx_api_key_usage_logs_created_at ON public.api_key_usage_logs(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_key_usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for api_keys table
CREATE POLICY "Admins can manage API keys in their org"
  ON public.api_keys
  FOR ALL
  USING (
    org_id = get_user_org_id(auth.uid()) AND
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  );

CREATE POLICY "Service role can manage all API keys"
  ON public.api_keys
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- RLS Policies for api_key_usage_logs table
CREATE POLICY "Admins can view usage logs in their org"
  ON public.api_key_usage_logs
  FOR SELECT
  USING (
    org_id = get_user_org_id(auth.uid()) AND
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  );

CREATE POLICY "Service role can manage all usage logs"
  ON public.api_key_usage_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_api_keys_updated_at
  BEFORE UPDATE ON public.api_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to generate API key with proper format
CREATE OR REPLACE FUNCTION public.generate_api_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_key TEXT;
  key_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate key with format: crm_bridge_<random 32 chars>
    new_key := 'crm_bridge_' || encode(gen_random_bytes(24), 'hex');
    
    -- Check if key already exists
    SELECT EXISTS(SELECT 1 FROM api_keys WHERE api_key = new_key) INTO key_exists;
    
    -- Exit loop if unique
    EXIT WHEN NOT key_exists;
  END LOOP;
  
  RETURN new_key;
END;
$$;