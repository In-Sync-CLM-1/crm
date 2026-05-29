-- Create email templates table
CREATE TABLE public.email_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  design_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  html_content TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Enable RLS
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for email_templates
CREATE POLICY "Users can view email templates in their org"
  ON public.email_templates
  FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage email templates"
  ON public.email_templates
  FOR ALL
  USING (
    org_id = get_user_org_id(auth.uid()) AND 
    (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  );

-- Create email bulk campaigns table
CREATE TABLE public.email_bulk_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  pending_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_bulk_campaigns ENABLE ROW LEVEL SECURITY;

-- RLS Policies for email_bulk_campaigns
CREATE POLICY "Users can view email campaigns in their org"
  ON public.email_bulk_campaigns
  FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can create email campaigns in their org"
  ON public.email_bulk_campaigns
  FOR INSERT
  WITH CHECK (
    org_id = get_user_org_id(auth.uid()) AND 
    created_by = auth.uid()
  );

CREATE POLICY "Users can update email campaigns in their org"
  ON public.email_bulk_campaigns
  FOR UPDATE
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can delete email campaigns in their org"
  ON public.email_bulk_campaigns
  FOR DELETE
  USING (
    org_id = get_user_org_id(auth.uid()) AND 
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  );

-- Create email campaign recipients table
CREATE TABLE public.email_campaign_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.email_bulk_campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;

-- RLS Policies for email_campaign_recipients
CREATE POLICY "Users can view email recipients in their org campaigns"
  ON public.email_campaign_recipients
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.email_bulk_campaigns
      WHERE email_bulk_campaigns.id = email_campaign_recipients.campaign_id
        AND email_bulk_campaigns.org_id = get_user_org_id(auth.uid())
    )
  );

CREATE POLICY "Service role can manage all email recipients"
  ON public.email_campaign_recipients
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create trigger for updated_at on email_templates
CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updated_at on email_bulk_campaigns
CREATE TRIGGER update_email_bulk_campaigns_updated_at
  BEFORE UPDATE ON public.email_bulk_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updated_at on email_campaign_recipients
CREATE TRIGGER update_email_campaign_recipients_updated_at
  BEFORE UPDATE ON public.email_campaign_recipients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to increment email campaign stats
CREATE OR REPLACE FUNCTION public.increment_email_campaign_stats(
  p_campaign_id UUID,
  p_sent_increment INTEGER DEFAULT 0,
  p_failed_increment INTEGER DEFAULT 0,
  p_pending_increment INTEGER DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE email_bulk_campaigns
  SET 
    sent_count = sent_count + p_sent_increment,
    failed_count = failed_count + p_failed_increment,
    pending_count = pending_count + p_pending_increment,
    updated_at = NOW()
  WHERE id = p_campaign_id;
END;
$$;