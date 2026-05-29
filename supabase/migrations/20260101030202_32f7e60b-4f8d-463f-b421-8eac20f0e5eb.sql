-- Create recurring activity patterns table
CREATE TABLE public.recurring_activity_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  activity_type TEXT NOT NULL,
  subject TEXT,
  description TEXT,
  scheduled_time TIME NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  days_of_week INTEGER[] NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  meeting_link TEXT,
  is_task BOOLEAN DEFAULT FALSE,
  assigned_to UUID REFERENCES auth.users(id),
  priority TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add recurring_pattern_id to contact_activities
ALTER TABLE public.contact_activities 
ADD COLUMN recurring_pattern_id UUID REFERENCES public.recurring_activity_patterns(id) ON DELETE SET NULL;

-- Add recurring_pattern_id to tasks
ALTER TABLE public.tasks 
ADD COLUMN recurring_pattern_id UUID REFERENCES public.recurring_activity_patterns(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.recurring_activity_patterns ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view patterns in their org (using profiles table)
CREATE POLICY "Users can view org recurring patterns"
ON public.recurring_activity_patterns FOR SELECT
USING (
  org_id IN (
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- RLS Policy: Users can create patterns in their org
CREATE POLICY "Users can create recurring patterns"
ON public.recurring_activity_patterns FOR INSERT
WITH CHECK (
  org_id IN (
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- RLS Policy: Users can update patterns they created
CREATE POLICY "Users can update own recurring patterns"
ON public.recurring_activity_patterns FOR UPDATE
USING (created_by = auth.uid());

-- RLS Policy: Users can delete patterns they created
CREATE POLICY "Users can delete own recurring patterns"
ON public.recurring_activity_patterns FOR DELETE
USING (created_by = auth.uid());

-- Create index for performance
CREATE INDEX idx_recurring_patterns_org_id ON public.recurring_activity_patterns(org_id);
CREATE INDEX idx_contact_activities_recurring ON public.contact_activities(recurring_pattern_id);
CREATE INDEX idx_tasks_recurring ON public.tasks(recurring_pattern_id);

-- Add trigger for updated_at
CREATE TRIGGER update_recurring_patterns_updated_at
BEFORE UPDATE ON public.recurring_activity_patterns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();