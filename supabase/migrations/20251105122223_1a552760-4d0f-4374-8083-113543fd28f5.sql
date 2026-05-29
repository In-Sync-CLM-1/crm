-- Create RPC function to get demo statistics for current month
CREATE OR REPLACE FUNCTION get_demo_stats_this_month(p_org_id UUID)
RETURNS TABLE (
  demos_done INTEGER,
  demos_upcoming INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_demo_stage_id UUID;
  v_month_start DATE;
  v_month_end DATE;
BEGIN
  -- Get the Demo stage ID for this org
  SELECT id INTO v_demo_stage_id
  FROM pipeline_stages
  WHERE org_id = p_org_id AND name = 'Demo'
  LIMIT 1;

  -- Calculate current month boundaries
  v_month_start := DATE_TRUNC('month', CURRENT_DATE);
  v_month_end := DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day';

  -- Return both counts
  RETURN QUERY
  SELECT
    -- Demos done: contacts that moved FROM Demo stage this month
    COALESCE((
      SELECT COUNT(DISTINCT contact_id)::INTEGER
      FROM pipeline_movement_history
      WHERE org_id = p_org_id
        AND from_stage_id = v_demo_stage_id
        AND moved_at >= v_month_start
        AND moved_at <= v_month_end + INTERVAL '1 day'
    ), 0) AS demos_done,
    
    -- Demos upcoming: contacts currently in Demo stage
    COALESCE((
      SELECT COUNT(*)::INTEGER
      FROM contacts
      WHERE org_id = p_org_id
        AND pipeline_stage_id = v_demo_stage_id
    ), 0) AS demos_upcoming;
END;
$$;