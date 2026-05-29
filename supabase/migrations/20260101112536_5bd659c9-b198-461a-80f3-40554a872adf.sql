-- Create revenue_goals table for tracking financial targets
CREATE TABLE public.revenue_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK (period_type IN ('monthly', 'quarterly', 'yearly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  goal_amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.revenue_goals ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view revenue goals in their org"
ON public.revenue_goals FOR SELECT
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create revenue goals in their org"
ON public.revenue_goals FOR INSERT
WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update revenue goals in their org"
ON public.revenue_goals FOR UPDATE
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete revenue goals in their org"
ON public.revenue_goals FOR DELETE
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- Index for faster queries
CREATE INDEX idx_revenue_goals_org_period ON public.revenue_goals(org_id, period_start, period_end);

-- Trigger for updated_at
CREATE TRIGGER update_revenue_goals_updated_at
BEFORE UPDATE ON public.revenue_goals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();