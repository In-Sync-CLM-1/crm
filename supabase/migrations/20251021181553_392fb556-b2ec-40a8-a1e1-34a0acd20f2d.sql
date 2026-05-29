-- Fix search_path security warning for track_pipeline_movement function
CREATE OR REPLACE FUNCTION track_pipeline_movement()
RETURNS TRIGGER AS $$
BEGIN
  -- Only track if stage actually changed
  IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
    -- Calculate days in previous stage
    INSERT INTO pipeline_movement_history (
      contact_id,
      org_id,
      from_stage_id,
      to_stage_id,
      moved_at,
      days_in_previous_stage,
      moved_by
    ) VALUES (
      NEW.id,
      NEW.org_id,
      OLD.pipeline_stage_id,
      NEW.pipeline_stage_id,
      NOW(),
      EXTRACT(EPOCH FROM (NOW() - OLD.updated_at)) / 86400,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;