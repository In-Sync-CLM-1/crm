-- Create pipeline movement history table for velocity tracking
CREATE TABLE IF NOT EXISTS public.pipeline_movement_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  days_in_previous_stage INTEGER,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  moved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create pipeline benchmarks table for performance comparison
CREATE TABLE IF NOT EXISTS public.pipeline_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  avg_days_in_stage NUMERIC,
  conversion_rate NUMERIC,
  total_contacts_processed INTEGER DEFAULT 0,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, stage_id, period_start, period_end)
);

-- Enable RLS
ALTER TABLE public.pipeline_movement_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_benchmarks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for pipeline_movement_history
CREATE POLICY "Users can view movement history in their org"
  ON public.pipeline_movement_history FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can insert movement history in their org"
  ON public.pipeline_movement_history FOR INSERT
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- RLS Policies for pipeline_benchmarks
CREATE POLICY "Users can view benchmarks in their org"
  ON public.pipeline_benchmarks FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "System can manage benchmarks"
  ON public.pipeline_benchmarks FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_pipeline_movement_contact ON public.pipeline_movement_history(contact_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_movement_org ON public.pipeline_movement_history(org_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_movement_moved_at ON public.pipeline_movement_history(moved_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_movement_stages ON public.pipeline_movement_history(from_stage_id, to_stage_id);

CREATE INDEX IF NOT EXISTS idx_pipeline_benchmarks_org_stage ON public.pipeline_benchmarks(org_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_benchmarks_period ON public.pipeline_benchmarks(period_start, period_end);

-- Create trigger function to track pipeline movements
CREATE OR REPLACE FUNCTION public.track_pipeline_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  days_in_stage INTEGER;
BEGIN
  -- Only track when stage actually changes
  IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id AND NEW.pipeline_stage_id IS NOT NULL THEN
    -- Calculate days in previous stage
    IF OLD.pipeline_stage_id IS NOT NULL THEN
      SELECT EXTRACT(DAY FROM NOW() - COALESCE(
        (SELECT moved_at FROM pipeline_movement_history 
         WHERE contact_id = NEW.id 
         ORDER BY moved_at DESC LIMIT 1),
        OLD.updated_at
      ))::INTEGER INTO days_in_stage;
    ELSE
      days_in_stage := 0;
    END IF;

    -- Insert movement record
    INSERT INTO public.pipeline_movement_history (
      org_id,
      contact_id,
      from_stage_id,
      to_stage_id,
      days_in_previous_stage,
      moved_at,
      moved_by
    ) VALUES (
      NEW.org_id,
      NEW.id,
      OLD.pipeline_stage_id,
      NEW.pipeline_stage_id,
      days_in_stage,
      NOW(),
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- Create trigger on contacts table
DROP TRIGGER IF EXISTS track_contact_pipeline_movement ON public.contacts;
CREATE TRIGGER track_contact_pipeline_movement
  AFTER UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.track_pipeline_movement();