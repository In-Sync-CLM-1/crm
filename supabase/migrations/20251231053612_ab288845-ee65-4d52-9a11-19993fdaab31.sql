
-- Create external_entities table for managing non-CRM parties
CREATE TABLE public.external_entities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL DEFAULT 'prospect' CHECK (entity_type IN ('prospect', 'vendor', 'partner', 'past_client', 'other')),
  name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  postal_code TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.external_entities ENABLE ROW LEVEL SECURITY;

-- RLS policies for external_entities
CREATE POLICY "Users can view external entities in their org"
  ON public.external_entities FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create external entities in their org"
  ON public.external_entities FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update external entities in their org"
  ON public.external_entities FOR UPDATE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete external entities in their org"
  ON public.external_entities FOR DELETE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_external_entities_updated_at
  BEFORE UPDATE ON public.external_entities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Modify client_documents to support multiple entity types
ALTER TABLE public.client_documents 
  ALTER COLUMN client_id DROP NOT NULL;

ALTER TABLE public.client_documents 
  ADD COLUMN contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN external_entity_id UUID REFERENCES public.external_entities(id) ON DELETE SET NULL;

-- Add check constraint to ensure at least one entity reference exists
ALTER TABLE public.client_documents 
  ADD CONSTRAINT client_documents_entity_check 
  CHECK (client_id IS NOT NULL OR contact_id IS NOT NULL OR external_entity_id IS NOT NULL);

-- Modify client_invoices to support multiple entity types
ALTER TABLE public.client_invoices 
  ALTER COLUMN client_id DROP NOT NULL;

ALTER TABLE public.client_invoices 
  ADD COLUMN contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN external_entity_id UUID REFERENCES public.external_entities(id) ON DELETE SET NULL;

-- Add check constraint to ensure at least one entity reference exists
ALTER TABLE public.client_invoices 
  ADD CONSTRAINT client_invoices_entity_check 
  CHECK (client_id IS NOT NULL OR contact_id IS NOT NULL OR external_entity_id IS NOT NULL);

-- Create indexes for better query performance
CREATE INDEX idx_external_entities_org_id ON public.external_entities(org_id);
CREATE INDEX idx_external_entities_entity_type ON public.external_entities(entity_type);
CREATE INDEX idx_client_documents_contact_id ON public.client_documents(contact_id);
CREATE INDEX idx_client_documents_external_entity_id ON public.client_documents(external_entity_id);
CREATE INDEX idx_client_invoices_contact_id ON public.client_invoices(contact_id);
CREATE INDEX idx_client_invoices_external_entity_id ON public.client_invoices(external_entity_id);
