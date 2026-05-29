-- Create saved_reports table
CREATE TABLE public.saved_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  data_source TEXT NOT NULL,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.saved_reports ENABLE ROW LEVEL SECURITY;

-- Users can view reports in their org
CREATE POLICY "Users can view reports in their org" 
ON public.saved_reports 
FOR SELECT 
USING (org_id = get_user_org_id(auth.uid()));

-- Users can create reports in their org
CREATE POLICY "Users can create reports in their org" 
ON public.saved_reports 
FOR INSERT 
WITH CHECK (org_id = get_user_org_id(auth.uid()) AND created_by = auth.uid());

-- Users can update their own reports
CREATE POLICY "Users can update their own reports" 
ON public.saved_reports 
FOR UPDATE 
USING (org_id = get_user_org_id(auth.uid()) AND created_by = auth.uid());

-- Admins can delete reports in their org
CREATE POLICY "Admins can delete reports in their org" 
ON public.saved_reports 
FOR DELETE 
USING (org_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));

-- Create trigger for updated_at
CREATE TRIGGER update_saved_reports_updated_at
BEFORE UPDATE ON public.saved_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();