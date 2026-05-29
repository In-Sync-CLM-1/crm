-- Add comprehensive logging and SECURITY DEFINER to get_dashboard_stats
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_org_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result JSON;
  v_total_contacts INTEGER;
  v_active_deals INTEGER;
  v_calls_today INTEGER;
  v_prev_month_contacts INTEGER;
  v_conversion_rate NUMERIC;
  v_auth_uid UUID;
  v_user_org_id UUID;
BEGIN
  -- Get current user context for debugging
  v_auth_uid := auth.uid();
  v_user_org_id := get_user_org_id(v_auth_uid);
  
  RAISE LOG '=== get_dashboard_stats START ===';
  RAISE LOG 'Parameter p_org_id: %', p_org_id;
  RAISE LOG 'Current auth.uid(): %', v_auth_uid;
  RAISE LOG 'get_user_org_id(auth.uid()): %', v_user_org_id;
  
  -- Total contacts
  SELECT COUNT(*) INTO v_total_contacts
  FROM contacts
  WHERE org_id = p_org_id;
  
  RAISE LOG 'Total contacts found: %', v_total_contacts;
  RAISE LOG 'Query was: SELECT COUNT(*) FROM contacts WHERE org_id = %', p_org_id;

  -- Active deals (contacts in pipeline stages)
  SELECT COUNT(*) INTO v_active_deals
  FROM contacts
  WHERE org_id = p_org_id AND pipeline_stage_id IS NOT NULL;
  
  RAISE LOG 'Active deals found: %', v_active_deals;

  -- Calls today
  SELECT COUNT(*) INTO v_calls_today
  FROM contact_activities
  WHERE org_id = p_org_id 
    AND activity_type = 'call'
    AND DATE(created_at) = CURRENT_DATE;
  
  RAISE LOG 'Calls today found: %', v_calls_today;

  -- Previous month contacts for growth calculation
  SELECT COUNT(*) INTO v_prev_month_contacts
  FROM contacts
  WHERE org_id = p_org_id
    AND created_at < DATE_TRUNC('month', CURRENT_DATE);
  
  RAISE LOG 'Previous month contacts: %', v_prev_month_contacts;

  -- Conversion rate
  SELECT CASE 
    WHEN v_total_contacts > 0 THEN
      ROUND((COUNT(*)::NUMERIC / v_total_contacts::NUMERIC) * 100, 2)
    ELSE 0
  END INTO v_conversion_rate
  FROM contacts c
  INNER JOIN pipeline_stages ps ON c.pipeline_stage_id = ps.id
  WHERE c.org_id = p_org_id AND ps.probability = 100;
  
  RAISE LOG 'Conversion rate calculated: %', v_conversion_rate;

  v_result := json_build_object(
    'total_contacts', v_total_contacts,
    'active_deals', v_active_deals,
    'calls_today', v_calls_today,
    'prev_month_contacts', v_prev_month_contacts,
    'conversion_rate', v_conversion_rate
  );
  
  RAISE LOG 'Final result: %', v_result;
  RAISE LOG '=== get_dashboard_stats END ===';

  RETURN v_result;
END;
$function$;

-- Add SECURITY DEFINER and logging to get_pipeline_distribution
CREATE OR REPLACE FUNCTION public.get_pipeline_distribution(p_org_id uuid)
RETURNS TABLE(stage_name text, contact_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RAISE LOG '=== get_pipeline_distribution START ===';
  RAISE LOG 'Parameter p_org_id: %', p_org_id;
  RAISE LOG 'Current auth.uid(): %', auth.uid();
  
  RETURN QUERY
  SELECT 
    COALESCE(ps.name, 'No Stage') as stage_name,
    COUNT(c.id) as contact_count
  FROM contacts c
  LEFT JOIN pipeline_stages ps ON c.pipeline_stage_id = ps.id
  WHERE c.org_id = p_org_id
  GROUP BY ps.name
  ORDER BY contact_count DESC;
  
  RAISE LOG '=== get_pipeline_distribution END ===';
END;
$function$;

-- Add SECURITY DEFINER and logging to get_activity_trends
CREATE OR REPLACE FUNCTION public.get_activity_trends(p_org_id uuid, p_days integer DEFAULT 7)
RETURNS TABLE(activity_date date, activity_type text, activity_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RAISE LOG '=== get_activity_trends START ===';
  RAISE LOG 'Parameter p_org_id: %, p_days: %', p_org_id, p_days;
  RAISE LOG 'Current auth.uid(): %', auth.uid();
  
  RETURN QUERY
  SELECT 
    DATE(created_at) as activity_date,
    activity_type,
    COUNT(*) as activity_count
  FROM contact_activities
  WHERE org_id = p_org_id
    AND created_at >= CURRENT_DATE - (p_days || ' days')::INTERVAL
  GROUP BY DATE(created_at), activity_type
  ORDER BY activity_date DESC, activity_type;
  
  RAISE LOG '=== get_activity_trends END ===';
END;
$function$;