-- Create whatsapp_bulk_campaigns table
CREATE TABLE public.whatsapp_bulk_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  name TEXT NOT NULL,
  template_id UUID REFERENCES public.communication_templates(id),
  message_content TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  pending_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'completed', 'failed', 'cancelled')),
  scheduled_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create whatsapp_campaign_recipients table
CREATE TABLE public.whatsapp_campaign_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.whatsapp_bulk_campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id),
  phone_number TEXT NOT NULL,
  message_id UUID REFERENCES public.whatsapp_messages(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'retrying', 'cancelled', 'permanently_failed')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  last_retry_at TIMESTAMP WITH TIME ZONE,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_bulk_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_campaign_recipients ENABLE ROW LEVEL SECURITY;

-- RLS Policies for whatsapp_bulk_campaigns
CREATE POLICY "Users can view campaigns in their org"
ON public.whatsapp_bulk_campaigns
FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can create campaigns in their org"
ON public.whatsapp_bulk_campaigns
FOR INSERT
WITH CHECK (org_id = get_user_org_id(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Users can update campaigns in their org"
ON public.whatsapp_bulk_campaigns
FOR UPDATE
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can delete campaigns in their org"
ON public.whatsapp_bulk_campaigns
FOR DELETE
USING (org_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));

-- RLS Policies for whatsapp_campaign_recipients
CREATE POLICY "Users can view recipients in their org campaigns"
ON public.whatsapp_campaign_recipients
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.whatsapp_bulk_campaigns
  WHERE id = campaign_id AND org_id = get_user_org_id(auth.uid())
));

CREATE POLICY "Service role can manage all recipients"
ON public.whatsapp_campaign_recipients
FOR ALL
USING (true)
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_campaign_recipients_campaign_id ON public.whatsapp_campaign_recipients(campaign_id);
CREATE INDEX idx_campaign_recipients_status ON public.whatsapp_campaign_recipients(status);
CREATE INDEX idx_campaign_recipients_retry ON public.whatsapp_campaign_recipients(status, next_retry_at) WHERE status IN ('failed', 'retrying');
CREATE INDEX idx_campaigns_org_id ON public.whatsapp_bulk_campaigns(org_id);
CREATE INDEX idx_campaigns_status ON public.whatsapp_bulk_campaigns(status);

-- Add trigger for updated_at
CREATE TRIGGER update_campaigns_updated_at
BEFORE UPDATE ON public.whatsapp_bulk_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_campaign_recipients_updated_at
BEFORE UPDATE ON public.whatsapp_campaign_recipients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for campaigns
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_bulk_campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_campaign_recipients;