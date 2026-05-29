-- Add search_path to get_platform_admin_stats for security best practices
CREATE OR REPLACE FUNCTION public.get_platform_admin_stats()
RETURNS JSON
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result JSON;
  v_total_orgs INTEGER;
  v_total_users INTEGER;
  v_active_users_1d INTEGER;
  v_active_users_7d INTEGER;
  v_active_users_30d INTEGER;
  v_total_contacts INTEGER;
  v_call_volume INTEGER;
  v_email_volume INTEGER;
BEGIN
  -- Basic counts
  SELECT COUNT(DISTINCT id) INTO v_total_orgs FROM organizations;
  SELECT COUNT(*) INTO v_total_users FROM profiles;
  SELECT COUNT(*) INTO v_total_contacts FROM contacts;
  
  -- Active users based on activity creation
  SELECT COUNT(DISTINCT created_by) INTO v_active_users_1d 
  FROM contact_activities 
  WHERE created_at > NOW() - INTERVAL '1 day'
    AND created_by IS NOT NULL;
  
  SELECT COUNT(DISTINCT created_by) INTO v_active_users_7d 
  FROM contact_activities 
  WHERE created_at > NOW() - INTERVAL '7 days'
    AND created_by IS NOT NULL;
  
  SELECT COUNT(DISTINCT created_by) INTO v_active_users_30d 
  FROM contact_activities 
  WHERE created_at > NOW() - INTERVAL '30 days'
    AND created_by IS NOT NULL;
  
  -- Call and email volume
  SELECT COUNT(*) INTO v_call_volume FROM call_logs;
  
  SELECT COUNT(*) INTO v_email_volume 
  FROM email_conversations 
  WHERE direction = 'outbound';

  v_result := json_build_object(
    'total_organizations', v_total_orgs,
    'total_users', v_total_users,
    'active_users_1d', v_active_users_1d,
    'active_users_7d', v_active_users_7d,
    'active_users_30d', v_active_users_30d,
    'total_contacts', v_total_contacts,
    'call_volume', v_call_volume,
    'email_volume', v_email_volume
  );

  RETURN v_result;
END;
$$;