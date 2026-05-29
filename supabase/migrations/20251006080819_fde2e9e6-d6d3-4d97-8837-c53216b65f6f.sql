-- Create custom fields table for dynamic contact fields
CREATE TABLE public.custom_fields (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  field_name TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_type TEXT NOT NULL, -- text, email, phone, number, date, select, textarea
  field_options JSONB NULL, -- for select type, stores options array
  is_required BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  field_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, field_name)
);

-- Enable RLS
ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;

-- Users can view custom fields in their org
CREATE POLICY "Users can view custom fields in their org"
ON public.custom_fields
FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

-- Admins can manage custom fields
CREATE POLICY "Admins can manage custom fields"
ON public.custom_fields
FOR ALL
USING (
  org_id = get_user_org_id(auth.uid()) 
  AND (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
);

-- Create table to store custom field values for contacts
CREATE TABLE public.contact_custom_fields (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL,
  custom_field_id UUID NOT NULL REFERENCES public.custom_fields(id) ON DELETE CASCADE,
  field_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(contact_id, custom_field_id)
);

-- Enable RLS
ALTER TABLE public.contact_custom_fields ENABLE ROW LEVEL SECURITY;

-- Users can view custom field values for contacts in their org
CREATE POLICY "Users can view contact custom fields in their org"
ON public.contact_custom_fields
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.contacts
    WHERE contacts.id = contact_custom_fields.contact_id
    AND contacts.org_id = get_user_org_id(auth.uid())
  )
);

-- Users can manage custom field values for contacts in their org
CREATE POLICY "Users can manage contact custom fields in their org"
ON public.contact_custom_fields
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.contacts
    WHERE contacts.id = contact_custom_fields.contact_id
    AND contacts.org_id = get_user_org_id(auth.uid())
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_custom_fields_updated_at
BEFORE UPDATE ON public.custom_fields
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contact_custom_fields_updated_at
BEFORE UPDATE ON public.contact_custom_fields
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();