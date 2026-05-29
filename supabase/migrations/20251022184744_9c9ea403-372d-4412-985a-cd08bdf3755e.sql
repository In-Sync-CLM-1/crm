-- Performance Optimization: Add indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_contacts_org_id ON contacts(org_id);
CREATE INDEX IF NOT EXISTS idx_contacts_pipeline_stage_id ON contacts(pipeline_stage_id);
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_org_created ON contacts(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_activities_created_at ON contact_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_activities_org_id ON contact_activities(org_id);
CREATE INDEX IF NOT EXISTS idx_email_bulk_campaigns_org_id ON email_bulk_campaigns(org_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_org_id ON pipeline_stages(org_id);

-- Dashboard statistics function
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

  -- Conversion rate (contacts with completed deals)
  SELECT CASE 
    WHEN v_total_contacts > 0 THEN
      ROUND((COUNT(*)::NUMERIC / v_total_contacts::NUMERIC) * 100, 2)
    ELSE 0
  END INTO v_conversion_rate
  FROM contacts c
  INNER JOIN pipeline_stages ps ON c.pipeline_stage_id = ps.id
  WHERE c.org_id = p_org_id AND ps.is_closed_won = true;

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

-- Pipeline distribution function
CREATE OR REPLACE FUNCTION get_pipeline_distribution(p_org_id UUID)
RETURNS TABLE(stage_name TEXT, contact_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(ps.name, 'No Stage') as stage_name,
    COUNT(c.id) as contact_count
  FROM contacts c
  LEFT JOIN pipeline_stages ps ON c.pipeline_stage_id = ps.id
  WHERE c.org_id = p_org_id
  GROUP BY ps.name
  ORDER BY contact_count DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Activity trends function (last N days)
CREATE OR REPLACE FUNCTION get_activity_trends(p_org_id UUID, p_days INTEGER DEFAULT 7)
RETURNS TABLE(activity_date DATE, activity_type TEXT, activity_count BIGINT) AS $$
BEGIN
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
END;
$$ LANGUAGE plpgsql STABLE;

-- Platform admin statistics function
CREATE OR REPLACE FUNCTION get_platform_admin_stats()
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_total_orgs INTEGER;
  v_total_users INTEGER;
  v_active_users INTEGER;
  v_total_contacts INTEGER;
BEGIN
  SELECT COUNT(DISTINCT id) INTO v_total_orgs FROM organizations;
  SELECT COUNT(*) INTO v_total_users FROM profiles;
  SELECT COUNT(*) INTO v_active_users FROM profiles WHERE last_seen_at > NOW() - INTERVAL '7 days';
  SELECT COUNT(*) INTO v_total_contacts FROM contacts;

  v_result := json_build_object(
    'total_organizations', v_total_orgs,
    'total_users', v_total_users,
    'active_users', v_active_users,
    'total_contacts', v_total_contacts
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Contacts with stages view for faster queries
CREATE MATERIALIZED VIEW IF NOT EXISTS contacts_with_stages AS
SELECT 
  c.id,
  c.org_id,
  c.first_name,
  c.last_name,
  c.email,
  c.phone,
  c.company,
  c.job_title,
  c.status,
  c.pipeline_stage_id,
  ps.name as stage_name,
  ps.stage_order,
  c.created_at,
  c.updated_at,
  c.assigned_to
FROM contacts c
LEFT JOIN pipeline_stages ps ON c.pipeline_stage_id = ps.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_with_stages_id ON contacts_with_stages(id);
CREATE INDEX IF NOT EXISTS idx_contacts_with_stages_org ON contacts_with_stages(org_id);

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_contacts_with_stages()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY contacts_with_stages;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT SELECT ON contacts_with_stages TO authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_pipeline_distribution(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_activity_trends(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_platform_admin_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_contacts_with_stages() TO service_role;