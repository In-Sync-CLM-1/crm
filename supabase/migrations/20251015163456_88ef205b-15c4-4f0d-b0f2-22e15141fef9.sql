-- Create approval_types table
CREATE TABLE public.approval_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

-- Create approval_rules table
CREATE TABLE public.approval_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  approval_type_id UUID NOT NULL REFERENCES public.approval_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  threshold_amount NUMERIC(12,2),
  required_roles TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.approval_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for approval_types
CREATE POLICY "Users can view approval types in their org"
  ON public.approval_types FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage approval types"
  ON public.approval_types FOR ALL
  USING (
    org_id = get_user_org_id(auth.uid()) 
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  );

-- RLS Policies for approval_rules
CREATE POLICY "Users can view approval rules in their org"
  ON public.approval_rules FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage approval rules"
  ON public.approval_rules FOR ALL
  USING (
    org_id = get_user_org_id(auth.uid()) 
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  );

-- Create indexes
CREATE INDEX idx_approval_types_org_id ON public.approval_types(org_id);
CREATE INDEX idx_approval_types_is_active ON public.approval_types(is_active);
CREATE INDEX idx_approval_rules_org_id ON public.approval_rules(org_id);
CREATE INDEX idx_approval_rules_approval_type_id ON public.approval_rules(approval_type_id);
CREATE INDEX idx_approval_rules_is_active ON public.approval_rules(is_active);

-- Create updated_at trigger for approval_types
CREATE TRIGGER update_approval_types_updated_at
  BEFORE UPDATE ON public.approval_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create updated_at trigger for approval_rules
CREATE TRIGGER update_approval_rules_updated_at
  BEFORE UPDATE ON public.approval_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();