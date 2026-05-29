
-- Create notification log table for support tickets
CREATE TABLE public.support_ticket_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  channel TEXT NOT NULL, -- 'email' or 'whatsapp'
  recipient TEXT NOT NULL, -- email address or phone number
  subject TEXT, -- email subject if applicable
  message_preview TEXT, -- first 200 chars of the message/html
  status TEXT NOT NULL DEFAULT 'sent', -- 'sent', 'failed'
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.support_ticket_notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view notifications for their org tickets"
ON public.support_ticket_notifications
FOR SELECT
USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert notifications for their org"
ON public.support_ticket_notifications
FOR INSERT
WITH CHECK (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- Index for fast lookup
CREATE INDEX idx_ticket_notifications_ticket_id ON public.support_ticket_notifications(ticket_id);
