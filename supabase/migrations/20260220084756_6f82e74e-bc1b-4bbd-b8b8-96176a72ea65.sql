
-- Create support_ticket_escalations table
CREATE TABLE public.support_ticket_escalations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  escalated_by UUID NOT NULL,
  escalated_to UUID NOT NULL,
  remarks TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.support_ticket_escalations ENABLE ROW LEVEL SECURITY;

-- RLS policies: org-scoped
CREATE POLICY "Users can view escalations in their org"
  ON public.support_ticket_escalations FOR SELECT
  USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create escalations in their org"
  ON public.support_ticket_escalations FOR INSERT
  WITH CHECK (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- Create storage bucket for escalation attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('ticket-escalation-attachments', 'ticket-escalation-attachments', true);

-- Storage RLS policies
CREATE POLICY "Authenticated users can upload escalation attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'ticket-escalation-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Anyone can view escalation attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ticket-escalation-attachments');

-- Index for faster lookups
CREATE INDEX idx_escalations_ticket_id ON public.support_ticket_escalations(ticket_id);
