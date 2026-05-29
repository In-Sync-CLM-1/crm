-- Create monthly_actuals_snapshot table for storing frozen monthly data
CREATE TABLE public.monthly_actuals_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  qualified_opps INTEGER DEFAULT 0,
  proposals INTEGER DEFAULT 0,
  deals_closed INTEGER DEFAULT 0,
  revenue_invoiced DECIMAL(15,2) DEFAULT 0,
  revenue_received DECIMAL(15,2) DEFAULT 0,
  frozen_at TIMESTAMPTZ DEFAULT NOW(),
  carry_forward_applied BOOLEAN DEFAULT FALSE,
  
  -- Store contact/invoice IDs for drill-down
  qualified_contact_ids UUID[] DEFAULT '{}',
  proposal_contact_ids UUID[] DEFAULT '{}',
  deal_contact_ids UUID[] DEFAULT '{}',
  invoiced_invoice_ids UUID[] DEFAULT '{}',
  received_invoice_ids UUID[] DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, year, month)
);

-- Create carry_forward_snapshot table for one-time carry-forward reference
CREATE TABLE public.carry_forward_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  reference_year INTEGER NOT NULL DEFAULT 2026, -- The year this carry-forward applies to
  qualified_contact_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, reference_year)
);

-- Enable RLS on both tables
ALTER TABLE public.monthly_actuals_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carry_forward_snapshot ENABLE ROW LEVEL SECURITY;

-- RLS policies for monthly_actuals_snapshot
CREATE POLICY "Users can view own org snapshots" 
ON public.monthly_actuals_snapshot 
FOR SELECT 
USING (org_id IN (
  SELECT org_id FROM public.profiles WHERE id = auth.uid()
));

CREATE POLICY "Users can insert own org snapshots" 
ON public.monthly_actuals_snapshot 
FOR INSERT 
WITH CHECK (org_id IN (
  SELECT org_id FROM public.profiles WHERE id = auth.uid()
));

CREATE POLICY "Users can update own org snapshots" 
ON public.monthly_actuals_snapshot 
FOR UPDATE 
USING (org_id IN (
  SELECT org_id FROM public.profiles WHERE id = auth.uid()
));

-- RLS policies for carry_forward_snapshot
CREATE POLICY "Users can view own org carry forward" 
ON public.carry_forward_snapshot 
FOR SELECT 
USING (org_id IN (
  SELECT org_id FROM public.profiles WHERE id = auth.uid()
));

CREATE POLICY "Users can insert own org carry forward" 
ON public.carry_forward_snapshot 
FOR INSERT 
WITH CHECK (org_id IN (
  SELECT org_id FROM public.profiles WHERE id = auth.uid()
));

-- Create indexes for performance
CREATE INDEX idx_monthly_actuals_org_year_month ON public.monthly_actuals_snapshot(org_id, year, month);
CREATE INDEX idx_carry_forward_org_year ON public.carry_forward_snapshot(org_id, reference_year);

-- Trigger for updated_at on monthly_actuals_snapshot
CREATE TRIGGER update_monthly_actuals_snapshot_updated_at
BEFORE UPDATE ON public.monthly_actuals_snapshot
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();