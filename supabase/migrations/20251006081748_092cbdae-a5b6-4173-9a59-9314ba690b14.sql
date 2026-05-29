-- Create forms table
CREATE TABLE public.forms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create form_fields junction table
CREATE TABLE public.form_fields (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  custom_field_id UUID NOT NULL REFERENCES public.custom_fields(id) ON DELETE CASCADE,
  field_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(form_id, custom_field_id)
);

-- Enable RLS
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_fields ENABLE ROW LEVEL SECURITY;

-- RLS Policies for forms
CREATE POLICY "Admins can manage forms"
ON public.forms
FOR ALL
USING (
  org_id = get_user_org_id(auth.uid()) AND
  (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
);

CREATE POLICY "Users can view forms in their org"
ON public.forms
FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

-- RLS Policies for form_fields
CREATE POLICY "Admins can manage form fields"
ON public.form_fields
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.forms
    WHERE forms.id = form_fields.form_id
    AND forms.org_id = get_user_org_id(auth.uid())
    AND (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY "Users can view form fields in their org"
ON public.form_fields
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.forms
    WHERE forms.id = form_fields.form_id
    AND forms.org_id = get_user_org_id(auth.uid())
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_forms_updated_at
BEFORE UPDATE ON public.forms
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();