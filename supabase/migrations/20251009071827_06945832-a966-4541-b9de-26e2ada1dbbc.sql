-- Create whatsapp_settings table for org-level credentials
CREATE TABLE public.whatsapp_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  gupshup_api_key TEXT NOT NULL,
  whatsapp_source_number TEXT NOT NULL,
  app_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(org_id)
);

-- Create communication_templates table for synced templates
CREATE TABLE public.communication_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_type TEXT NOT NULL CHECK (template_type IN ('whatsapp', 'email', 'sms')),
  category TEXT,
  language TEXT,
  content TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'approved',
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(org_id, template_id, template_type)
);

-- Create whatsapp_messages table for tracking sent messages
CREATE TABLE public.whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.communication_templates(id),
  sent_by UUID REFERENCES auth.users(id),
  phone_number TEXT NOT NULL,
  message_content TEXT NOT NULL,
  template_variables JSONB,
  gupshup_message_id TEXT,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for whatsapp_settings
CREATE POLICY "Admins can manage WhatsApp settings"
ON public.whatsapp_settings
FOR ALL
USING (
  org_id = get_user_org_id(auth.uid()) AND
  (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
);

CREATE POLICY "Users can view WhatsApp settings in their org"
ON public.whatsapp_settings
FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

-- RLS Policies for communication_templates
CREATE POLICY "Admins can manage templates"
ON public.communication_templates
FOR ALL
USING (
  org_id = get_user_org_id(auth.uid()) AND
  (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
);

CREATE POLICY "Users can view templates in their org"
ON public.communication_templates
FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

-- RLS Policies for whatsapp_messages
CREATE POLICY "Users can view messages in their org"
ON public.whatsapp_messages
FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can send messages in their org"
ON public.whatsapp_messages
FOR INSERT
WITH CHECK (
  org_id = get_user_org_id(auth.uid()) AND
  sent_by = auth.uid()
);

-- Create trigger for updated_at
CREATE TRIGGER update_whatsapp_settings_updated_at
BEFORE UPDATE ON public.whatsapp_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_communication_templates_updated_at
BEFORE UPDATE ON public.communication_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();