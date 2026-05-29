-- Fix Security Issue #4: Database Functions Missing search_path
-- This adds SET search_path to all functions to prevent SQL injection attacks

-- 1. Fix get_subordinates function
CREATE OR REPLACE FUNCTION public.get_subordinates(p_designation_id uuid)
RETURNS TABLE(designation_id uuid, level integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
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

-- 2. Fix get_reporting_chain function
CREATE OR REPLACE FUNCTION public.get_reporting_chain(p_designation_id uuid)
RETURNS TABLE(designation_id uuid, level integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
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

-- 3. Fix create_default_pipeline_stages function
CREATE OR REPLACE FUNCTION public.create_default_pipeline_stages(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.pipeline_stages (org_id, name, description, stage_order, probability, color) VALUES
    (_org_id, 'New', 'Newly created leads', 1, 10, '#8AD4EB'),
    (_org_id, 'Contacted', 'Initial contact made', 2, 25, '#01B8AA'),
    (_org_id, 'Qualified', 'Lead qualified', 3, 50, '#F2C80F'),
    (_org_id, 'Proposal', 'Proposal sent', 4, 70, '#A66999'),
    (_org_id, 'Negotiation', 'In negotiation', 5, 85, '#FE9666'),
    (_org_id, 'Won', 'Deal won', 6, 100, '#168980'),
    (_org_id, 'Lost', 'Deal lost', 7, 0, '#FD625E');
END;
$$;

COMMENT ON FUNCTION public.get_subordinates(uuid) IS 'Returns all subordinates in reporting hierarchy - SECURITY DEFINER with locked search_path';
COMMENT ON FUNCTION public.get_reporting_chain(uuid) IS 'Returns reporting chain up to top - SECURITY DEFINER with locked search_path';
COMMENT ON FUNCTION public.create_default_pipeline_stages(uuid) IS 'Creates default pipeline stages for new org - SECURITY DEFINER with locked search_path';