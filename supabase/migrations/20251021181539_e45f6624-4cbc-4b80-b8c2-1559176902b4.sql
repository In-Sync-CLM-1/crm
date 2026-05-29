-- Add trigger to automatically track pipeline movements
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on contacts table
DROP TRIGGER IF EXISTS track_pipeline_movement_trigger ON contacts;
CREATE TRIGGER track_pipeline_movement_trigger
  AFTER UPDATE OF pipeline_stage_id ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION track_pipeline_movement();

-- Backfill initial data for existing contacts (simulate movements from creation)
INSERT INTO pipeline_movement_history (
  contact_id,
  org_id,
  from_stage_id,
  to_stage_id,
  moved_at,
  days_in_previous_stage,
  moved_by
)
SELECT 
  c.id,
  c.org_id,
  NULL, -- no previous stage for initial placement
  c.pipeline_stage_id,
  c.created_at,
  0,
  NULL
FROM contacts c
WHERE c.pipeline_stage_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM pipeline_movement_history pmh 
    WHERE pmh.contact_id = c.id
  );