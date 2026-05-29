-- Create sms_messages table for storing SMS history
CREATE TABLE public.sms_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  sent_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  message_content TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'received')),
  exotel_sms_id TEXT,
  exotel_status_code TEXT,
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  delivered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_sms_messages_org_id ON public.sms_messages(org_id);
CREATE INDEX idx_sms_messages_contact_id ON public.sms_messages(contact_id);
CREATE INDEX idx_sms_messages_phone_number ON public.sms_messages(phone_number);
CREATE INDEX idx_sms_messages_sent_at ON public.sms_messages(sent_at DESC);

-- Enable RLS
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view SMS messages in their org"
ON public.sms_messages FOR SELECT
USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert SMS messages in their org"
ON public.sms_messages FOR INSERT
WITH CHECK (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update SMS messages in their org"
ON public.sms_messages FOR UPDATE
USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- Add SMS enabled flag to exotel_settings if not exists
ALTER TABLE public.exotel_settings 
ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS sms_sender_id TEXT;

-- Create sms_bulk_campaigns table
CREATE TABLE public.sms_bulk_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_name TEXT NOT NULL,
  message_content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'processing', 'completed', 'paused', 'cancelled')),
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  pending_count INTEGER DEFAULT 0,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for campaigns
ALTER TABLE public.sms_bulk_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view SMS campaigns in their org"
ON public.sms_bulk_campaigns FOR SELECT
USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can manage SMS campaigns in their org"
ON public.sms_bulk_campaigns FOR ALL
USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- Create SMS campaign recipients table
CREATE TABLE public.sms_campaign_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.sms_bulk_campaigns(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  contact_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'skipped')),
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for campaign recipients
CREATE INDEX idx_sms_campaign_recipients_campaign_id ON public.sms_campaign_recipients(campaign_id);
CREATE INDEX idx_sms_campaign_recipients_status ON public.sms_campaign_recipients(status);

-- Enable RLS
ALTER TABLE public.sms_campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view SMS campaign recipients in their org"
ON public.sms_campaign_recipients FOR SELECT
USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can manage SMS campaign recipients in their org"
ON public.sms_campaign_recipients FOR ALL
USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- Function to increment SMS campaign stats
CREATE OR REPLACE FUNCTION public.increment_sms_campaign_stats(
  p_campaign_id UUID, 
  p_sent_increment INTEGER DEFAULT 0, 
  p_failed_increment INTEGER DEFAULT 0, 
  p_pending_increment INTEGER DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE sms_bulk_campaigns
  SET 
    sent_count = sent_count + p_sent_increment,
    failed_count = failed_count + p_failed_increment,
    pending_count = pending_count + p_pending_increment,
    updated_at = NOW()
  WHERE id = p_campaign_id;
END;
$$;