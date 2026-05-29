-- Phase 6: Advanced Email Automation Features

-- 1. Business Hours Configuration
CREATE TABLE IF NOT EXISTS public.org_business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 6=Saturday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, day_of_week)
);

ALTER TABLE public.org_business_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view business hours in their org"
  ON public.org_business_hours FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage business hours"
  ON public.org_business_hours FOR ALL
  USING (
    org_id = get_user_org_id(auth.uid()) AND 
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))
  );

-- 2. Email Suppression List
CREATE TABLE IF NOT EXISTS public.email_suppression_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  reason TEXT NOT NULL, -- 'unsubscribed', 'bounced', 'complained', 'manual'
  suppressed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  suppressed_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, email)
);

ALTER TABLE public.email_suppression_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view suppression list in their org"
  ON public.email_suppression_list FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage suppression list"
  ON public.email_suppression_list FOR ALL
  USING (
    org_id = get_user_org_id(auth.uid()) AND 
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))
  );

CREATE POLICY "Service role can manage suppression list"
  ON public.email_suppression_list FOR ALL
  USING (true)
  WITH CHECK (true);

-- 3. Email Engagement Tracking
ALTER TABLE public.email_conversations 
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_clicked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS open_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tracking_pixel_id TEXT UNIQUE;

-- Create index for tracking lookups
CREATE INDEX IF NOT EXISTS idx_email_conversations_tracking_pixel 
  ON public.email_conversations(tracking_pixel_id) 
  WHERE tracking_pixel_id IS NOT NULL;

-- 4. A/B Testing Support
CREATE TABLE IF NOT EXISTS public.automation_ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.email_automation_rules(id) ON DELETE CASCADE,
  test_name TEXT NOT NULL,
  variants JSONB NOT NULL, -- [{"name": "A", "template_id": "...", "subject": "...", "weight": 50}]
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'paused', 'completed'
  winner_variant TEXT,
  start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_ab_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view AB tests in their org"
  ON public.automation_ab_tests FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage AB tests"
  ON public.automation_ab_tests FOR ALL
  USING (
    org_id = get_user_org_id(auth.uid()) AND 
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))
  );

-- Track which variant was used for each execution
ALTER TABLE public.email_automation_executions
  ADD COLUMN IF NOT EXISTS ab_test_id UUID REFERENCES public.automation_ab_tests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ab_variant_name TEXT;

-- 5. Add business hours enforcement to rules
ALTER TABLE public.email_automation_rules
  ADD COLUMN IF NOT EXISTS enforce_business_hours BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ab_test_enabled BOOLEAN NOT NULL DEFAULT false;

-- 6. Function to check if email is suppressed
CREATE OR REPLACE FUNCTION public.is_email_suppressed(_org_id UUID, _email TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.email_suppression_list
    WHERE org_id = _org_id AND LOWER(email) = LOWER(_email)
  );
$$;

-- 7. Function to check if current time is within business hours
CREATE OR REPLACE FUNCTION public.is_within_business_hours(_org_id UUID, _check_time TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day_of_week INTEGER;
  v_current_time TIME;
  v_timezone TEXT;
  v_business_hours RECORD;
BEGIN
  -- Get org timezone from business hours config
  SELECT timezone INTO v_timezone
  FROM public.org_business_hours
  WHERE org_id = _org_id
  LIMIT 1;
  
  -- Default to UTC if no timezone configured
  v_timezone := COALESCE(v_timezone, 'UTC');
  
  -- Convert check time to org timezone
  v_day_of_week := EXTRACT(DOW FROM _check_time AT TIME ZONE v_timezone)::INTEGER;
  v_current_time := (_check_time AT TIME ZONE v_timezone)::TIME;
  
  -- Check if there's an enabled business hour for this day
  SELECT * INTO v_business_hours
  FROM public.org_business_hours
  WHERE org_id = _org_id 
    AND day_of_week = v_day_of_week
    AND is_enabled = true;
  
  -- If no business hours configured for this day, consider it outside business hours
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Check if current time is within the configured hours
  RETURN v_current_time >= v_business_hours.start_time 
    AND v_current_time <= v_business_hours.end_time;
END;
$$;

-- 8. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_suppression_org_email 
  ON public.email_suppression_list(org_id, LOWER(email));

CREATE INDEX IF NOT EXISTS idx_automation_ab_tests_rule 
  ON public.automation_ab_tests(rule_id, status);

CREATE INDEX IF NOT EXISTS idx_email_executions_ab_test 
  ON public.email_automation_executions(ab_test_id, ab_variant_name) 
  WHERE ab_test_id IS NOT NULL;