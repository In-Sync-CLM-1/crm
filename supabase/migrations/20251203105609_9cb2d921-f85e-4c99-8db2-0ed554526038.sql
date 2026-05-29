-- Create table for alternate contacts associated with clients
CREATE TABLE public.client_alternate_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  designation TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.client_alternate_contacts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view alternate contacts in their org"
ON public.client_alternate_contacts FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can create alternate contacts in their org"
ON public.client_alternate_contacts FOR INSERT
WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can update alternate contacts in their org"
ON public.client_alternate_contacts FOR UPDATE
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can delete alternate contacts"
ON public.client_alternate_contacts FOR DELETE
USING (
  org_id = get_user_org_id(auth.uid()) AND 
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
);

-- Index for faster lookups
CREATE INDEX idx_client_alternate_contacts_client_id ON public.client_alternate_contacts(client_id);
CREATE INDEX idx_client_alternate_contacts_org_id ON public.client_alternate_contacts(org_id);