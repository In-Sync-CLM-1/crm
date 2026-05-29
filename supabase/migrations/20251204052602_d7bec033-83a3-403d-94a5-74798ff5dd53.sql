-- Create exotel_exophones table for multiple ExoPhones per organization
CREATE TABLE public.exotel_exophones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  friendly_name TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, phone_number)
);

-- Enable RLS
ALTER TABLE public.exotel_exophones ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage ExoPhones"
ON public.exotel_exophones
FOR ALL
USING (
  (org_id = get_user_org_id(auth.uid())) 
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
);

CREATE POLICY "Users can view ExoPhones in their org"
ON public.exotel_exophones
FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

-- Function to ensure only one default ExoPhone per org
CREATE OR REPLACE FUNCTION public.ensure_single_default_exophone()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.exotel_exophones 
    SET is_default = false 
    WHERE org_id = NEW.org_id AND id != NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for single default
CREATE TRIGGER ensure_single_default_exophone_trigger
BEFORE INSERT OR UPDATE ON public.exotel_exophones
FOR EACH ROW
EXECUTE FUNCTION public.ensure_single_default_exophone();

-- Trigger for updated_at
CREATE TRIGGER update_exotel_exophones_updated_at
BEFORE UPDATE ON public.exotel_exophones
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();