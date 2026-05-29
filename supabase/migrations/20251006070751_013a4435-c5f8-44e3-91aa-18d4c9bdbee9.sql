-- Create designations table
CREATE TABLE public.designations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  role app_role NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create reporting hierarchy table
CREATE TABLE public.reporting_hierarchy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  designation_id UUID REFERENCES public.designations(id) ON DELETE CASCADE NOT NULL,
  reports_to_designation_id UUID REFERENCES public.designations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(designation_id)
);

-- Add designation_id to profiles
ALTER TABLE public.profiles ADD COLUMN designation_id UUID REFERENCES public.designations(id);

-- Enable RLS
ALTER TABLE public.designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reporting_hierarchy ENABLE ROW LEVEL SECURITY;

-- RLS Policies for designations
CREATE POLICY "Users can view designations in their org"
  ON public.designations FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage designations"
  ON public.designations FOR ALL
  USING (
    org_id = get_user_org_id(auth.uid()) AND 
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  );

-- RLS Policies for reporting_hierarchy
CREATE POLICY "Users can view hierarchy in their org"
  ON public.reporting_hierarchy FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage hierarchy"
  ON public.reporting_hierarchy FOR ALL
  USING (
    org_id = get_user_org_id(auth.uid()) AND 
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  );

-- Create triggers for updated_at
CREATE TRIGGER update_designations_updated_at
  BEFORE UPDATE ON public.designations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_reporting_hierarchy_updated_at
  BEFORE UPDATE ON public.reporting_hierarchy
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to get all subordinates recursively
CREATE OR REPLACE FUNCTION public.get_subordinates(p_designation_id UUID)
RETURNS TABLE(designation_id UUID, level INTEGER)
LANGUAGE sql
STABLE
AS $$
  WITH RECURSIVE subordinates AS (
    -- Base case: direct reports
    SELECT 
      rh.designation_id,
      1 as level
    FROM public.reporting_hierarchy rh
    WHERE rh.reports_to_designation_id = p_designation_id
    
    UNION ALL
    
    -- Recursive case: reports of reports
    SELECT 
      rh.designation_id,
      s.level + 1
    FROM public.reporting_hierarchy rh
    INNER JOIN subordinates s ON rh.reports_to_designation_id = s.designation_id
  )
  SELECT * FROM subordinates;
$$;

-- Create function to get reporting chain (upward hierarchy)
CREATE OR REPLACE FUNCTION public.get_reporting_chain(p_designation_id UUID)
RETURNS TABLE(designation_id UUID, level INTEGER)
LANGUAGE sql
STABLE
AS $$
  WITH RECURSIVE chain AS (
    -- Base case: the designation itself
    SELECT 
      p_designation_id as designation_id,
      0 as level
    
    UNION ALL
    
    -- Recursive case: manager of current designation
    SELECT 
      rh.reports_to_designation_id,
      c.level + 1
    FROM public.reporting_hierarchy rh
    INNER JOIN chain c ON rh.designation_id = c.designation_id
    WHERE rh.reports_to_designation_id IS NOT NULL
  )
  SELECT * FROM chain WHERE designation_id IS NOT NULL;
$$;