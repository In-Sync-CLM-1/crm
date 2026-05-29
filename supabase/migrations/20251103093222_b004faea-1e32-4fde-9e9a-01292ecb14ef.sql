-- Fix get_dashboard_stats function - remove reference to non-existent is_closed_won column
CREATE OR REPLACE FUNCTION get_dashboard_stats(p_org_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_total_contacts INTEGER;
  v_active_deals INTEGER;
  v_calls_today INTEGER;
  v_prev_month_contacts INTEGER;
  v_conversion_rate NUMERIC;
BEGIN
  -- Total contacts
  SELECT COUNT(*) INTO v_total_contacts
  FROM contacts
  WHERE org_id = p_org_id;

  -- Active deals (contacts in pipeline stages)
  SELECT COUNT(*) INTO v_active_deals
  FROM contacts
  WHERE org_id = p_org_id AND pipeline_stage_id IS NOT NULL;

  -- Calls today
  SELECT COUNT(*) INTO v_calls_today
  FROM contact_activities
  WHERE org_id = p_org_id 
    AND activity_type = 'call'
    AND DATE(created_at) = CURRENT_DATE;

  -- Previous month contacts for growth calculation
  SELECT COUNT(*) INTO v_prev_month_contacts
  FROM contacts
  WHERE org_id = p_org_id
    AND created_at < DATE_TRUNC('month', CURRENT_DATE);

  -- Conversion rate (contacts with high probability stages, probability = 100 means won)
  SELECT CASE 
    WHEN v_total_contacts > 0 THEN
      ROUND((COUNT(*)::NUMERIC / v_total_contacts::NUMERIC) * 100, 2)
    ELSE 0
  END INTO v_conversion_rate
  FROM contacts c
  INNER JOIN pipeline_stages ps ON c.pipeline_stage_id = ps.id
  WHERE c.org_id = p_org_id AND ps.probability = 100;

  v_result := json_build_object(
    'total_contacts', v_total_contacts,
    'active_deals', v_active_deals,
    'calls_today', v_calls_today,
    'prev_month_contacts', v_prev_month_contacts,
    'conversion_rate', v_conversion_rate
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;