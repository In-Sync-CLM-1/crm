-- Create exotel_settings table
CREATE TABLE public.exotel_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  api_token TEXT NOT NULL,
  account_sid TEXT NOT NULL,
  subdomain TEXT NOT NULL DEFAULT 'api.exotel.com',
  caller_id TEXT NOT NULL,
  call_recording_enabled BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id)
);

-- Create call_logs table
CREATE TABLE public.call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  exotel_call_sid TEXT UNIQUE NOT NULL,
  exotel_conversation_uuid TEXT,
  
  call_type TEXT NOT NULL CHECK (call_type IN ('inbound', 'outbound')),
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  direction TEXT NOT NULL,
  
  status TEXT NOT NULL,
  call_duration INTEGER,
  ring_duration INTEGER,
  conversation_duration INTEGER,
  
  started_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  recording_url TEXT,
  recording_duration INTEGER,
  
  disposition_id UUID REFERENCES public.call_dispositions(id),
  sub_disposition_id UUID REFERENCES public.call_sub_dispositions(id),
  
  exotel_raw_data JSONB,
  notes TEXT,
  
  activity_id UUID REFERENCES public.contact_activities(id)
);

CREATE INDEX idx_call_logs_org_id ON public.call_logs(org_id);
CREATE INDEX idx_call_logs_contact_id ON public.call_logs(contact_id);
CREATE INDEX idx_call_logs_agent_id ON public.call_logs(agent_id);
CREATE INDEX idx_call_logs_created_at ON public.call_logs(created_at DESC);
CREATE INDEX idx_call_logs_exotel_sid ON public.call_logs(exotel_call_sid);

-- Create agent_call_sessions table
CREATE TABLE public.agent_call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id),
  exotel_call_sid TEXT,
  status TEXT NOT NULL DEFAULT 'initiating',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  UNIQUE(agent_id)
);

-- Enable RLS
ALTER TABLE public.exotel_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_call_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for exotel_settings
CREATE POLICY "Admins can manage exotel settings"
ON public.exotel_settings
FOR ALL
USING (
  org_id = get_user_org_id(auth.uid()) 
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))
);

CREATE POLICY "Users can view exotel settings in their org"
ON public.exotel_settings
FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

-- RLS Policies for call_logs
CREATE POLICY "Users can view call logs in their org"
ON public.call_logs
FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Service role can manage all call logs"
ON public.call_logs
FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Calling-enabled users can create call logs"
ON public.call_logs
FOR INSERT
WITH CHECK (
  org_id = get_user_org_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND calling_enabled = true
  )
);

CREATE POLICY "Users can update their own call logs"
ON public.call_logs
FOR UPDATE
USING (
  org_id = get_user_org_id(auth.uid())
  AND agent_id = auth.uid()
);

-- RLS Policies for agent_call_sessions
CREATE POLICY "Users can view their own active call sessions"
ON public.agent_call_sessions
FOR SELECT
USING (agent_id = auth.uid());

CREATE POLICY "Service role can manage all call sessions"
ON public.agent_call_sessions
FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Calling-enabled users can create call sessions"
ON public.agent_call_sessions
FOR INSERT
WITH CHECK (
  agent_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND calling_enabled = true
  )
);

CREATE POLICY "Users can update their own call sessions"
ON public.agent_call_sessions
FOR UPDATE
USING (agent_id = auth.uid());

CREATE POLICY "Users can delete their own call sessions"
ON public.agent_call_sessions
FOR DELETE
USING (agent_id = auth.uid());

-- Enable realtime for call_logs and agent_call_sessions
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_call_sessions;

-- Create trigger for updated_at on exotel_settings
CREATE TRIGGER update_exotel_settings_updated_at
BEFORE UPDATE ON public.exotel_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();