-- Create function to get organization-wise statistics
CREATE OR REPLACE FUNCTION public.get_org_statistics(p_org_id uuid)
RETURNS JSON
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result JSON;
  v_user_count INTEGER;
  v_contact_count INTEGER;
  v_active_1d INTEGER;
  v_active_7d INTEGER;
  v_active_30d INTEGER;
  v_call_volume INTEGER;
  v_email_volume INTEGER;
BEGIN
  -- Count users in org
  SELECT COUNT(*) INTO v_user_count
  FROM profiles
  WHERE org_id = p_org_id;
  
  -- Count contacts in org
  SELECT COUNT(*) INTO v_contact_count
  FROM contacts
  WHERE org_id = p_org_id;
  
  -- Active users in last 1 day (based on activity creation)
  SELECT COUNT(DISTINCT created_by) INTO v_active_1d
  FROM contact_activities
  WHERE org_id = p_org_id
    AND created_at > NOW() - INTERVAL '1 day'
    AND created_by IS NOT NULL;
  
  -- Active users in last 7 days
  SELECT COUNT(DISTINCT created_by) INTO v_active_7d
  FROM contact_activities
  WHERE org_id = p_org_id
    AND created_at > NOW() - INTERVAL '7 days'
    AND created_by IS NOT NULL;
  
  -- Active users in last 30 days
  SELECT COUNT(DISTINCT created_by) INTO v_active_30d
  FROM contact_activities
  WHERE org_id = p_org_id
    AND created_at > NOW() - INTERVAL '30 days'
    AND created_by IS NOT NULL;
  
  -- Call volume (all time)
  SELECT COUNT(*) INTO v_call_volume
  FROM call_logs
  WHERE org_id = p_org_id;
  
  -- Email volume (outbound only)
  SELECT COUNT(*) INTO v_email_volume
  FROM email_conversations
  WHERE org_id = p_org_id
    AND direction = 'outbound';

  v_result := json_build_object(
    'user_count', v_user_count,
    'contact_count', v_contact_count,
    'active_users_1d', v_active_1d,
    'active_users_7d', v_active_7d,
    'active_users_30d', v_active_30d,
    'call_volume', v_call_volume,
    'email_volume', v_email_volume
  );

  RETURN v_result;
END;
$$;