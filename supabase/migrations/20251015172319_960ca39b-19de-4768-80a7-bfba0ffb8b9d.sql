-- Create function to get all sales performance metrics in one query
CREATE OR REPLACE FUNCTION public.get_sales_performance_report(
  p_org_id uuid,
  p_start_date timestamp with time zone
)
RETURNS TABLE (
  user_id uuid,
  user_name text,
  total_contacts bigint,
  total_calls bigint,
  total_emails bigint,
  total_meetings bigint,
  deals_won bigint,
  conversion_rate numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH user_contacts AS (
    SELECT 
      c.created_by,
      COUNT(*) as contact_count
    FROM contacts c
    WHERE c.org_id = p_org_id
      AND c.created_at >= p_start_date
      AND c.created_by IS NOT NULL
    GROUP BY c.created_by
  ),
  user_activities AS (
    SELECT
      ca.created_by,
      COUNT(*) FILTER (WHERE ca.activity_type = 'call') as call_count,
      COUNT(*) FILTER (WHERE ca.activity_type = 'email') as email_count,
      COUNT(*) FILTER (WHERE ca.activity_type = 'meeting') as meeting_count
    FROM contact_activities ca
    WHERE ca.org_id = p_org_id
      AND ca.created_at >= p_start_date
      AND ca.created_by IS NOT NULL
    GROUP BY ca.created_by
  ),
  won_stage AS (
    SELECT id as stage_id
    FROM pipeline_stages
    WHERE org_id = p_org_id
      AND LOWER(name) = 'won'
    LIMIT 1
  ),
  user_deals AS (
    SELECT
      c.created_by,
      COUNT(*) as won_count
    FROM contacts c
    CROSS JOIN won_stage ws
    WHERE c.org_id = p_org_id
      AND c.pipeline_stage_id = ws.stage_id
      AND c.created_by IS NOT NULL
    GROUP BY c.created_by
  )
  SELECT
    p.id as user_id,
    COALESCE(p.first_name || ' ' || COALESCE(p.last_name, ''), 'Unknown') as user_name,
    COALESCE(uc.contact_count, 0) as total_contacts,
    COALESCE(ua.call_count, 0) as total_calls,
    COALESCE(ua.email_count, 0) as total_emails,
    COALESCE(ua.meeting_count, 0) as total_meetings,
    COALESCE(ud.won_count, 0) as deals_won,
    CASE 
      WHEN COALESCE(uc.contact_count, 0) > 0 
      THEN ROUND((COALESCE(ud.won_count, 0)::numeric / uc.contact_count::numeric) * 100, 2)
      ELSE 0
    END as conversion_rate
  FROM profiles p
  LEFT JOIN user_contacts uc ON p.id = uc.created_by
  LEFT JOIN user_activities ua ON p.id = ua.created_by
  LEFT JOIN user_deals ud ON p.id = ud.created_by
  WHERE p.org_id = p_org_id
    AND (uc.contact_count > 0 OR ua.call_count > 0 OR ua.email_count > 0 OR ua.meeting_count > 0 OR ud.won_count > 0)
  ORDER BY p.first_name;
END;
$$;

-- Create function to get pipeline performance metrics in one query
CREATE OR REPLACE FUNCTION public.get_pipeline_performance_report(p_org_id uuid)
RETURNS TABLE (
  stage_id uuid,
  stage_name text,
  stage_order integer,
  stage_color text,
  contact_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ps.id as stage_id,
    ps.name as stage_name,
    ps.stage_order,
    ps.color as stage_color,
    COUNT(c.id) as contact_count
  FROM pipeline_stages ps
  LEFT JOIN contacts c ON c.pipeline_stage_id = ps.id AND c.org_id = p_org_id
  WHERE ps.org_id = p_org_id
  GROUP BY ps.id, ps.name, ps.stage_order, ps.color
  ORDER BY ps.stage_order;
END;
$$;