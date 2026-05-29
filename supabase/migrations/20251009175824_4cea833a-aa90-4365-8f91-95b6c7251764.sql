-- Phase 1: Create Feature Permissions System

-- 1. Create feature_permissions table
CREATE TABLE IF NOT EXISTS public.feature_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT NOT NULL UNIQUE,
  feature_name TEXT NOT NULL,
  feature_description TEXT,
  category TEXT NOT NULL,
  is_premium BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create org_feature_access table
CREATE TABLE IF NOT EXISTS public.org_feature_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  enabled_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  notes TEXT,
  modified_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, feature_key)
);

-- 3. Create designation_feature_access table
CREATE TABLE IF NOT EXISTS public.designation_feature_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  designation_id UUID NOT NULL REFERENCES public.designations(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  can_view BOOLEAN DEFAULT true,
  can_create BOOLEAN DEFAULT false,
  can_edit BOOLEAN DEFAULT false,
  can_delete BOOLEAN DEFAULT false,
  custom_permissions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(designation_id, feature_key)
);

-- 4. Enable RLS
ALTER TABLE public.org_feature_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.designation_feature_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_permissions ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for org_feature_access
CREATE POLICY "Platform admins can manage org feature access"
ON public.org_feature_access FOR ALL
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

CREATE POLICY "Users can view own org feature access"
ON public.org_feature_access FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

-- 6. RLS Policies for designation_feature_access
CREATE POLICY "Platform admins can manage designation feature access"
ON public.designation_feature_access FOR ALL
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

CREATE POLICY "Users can view own org designation access"
ON public.designation_feature_access FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

-- 7. RLS Policies for feature_permissions
CREATE POLICY "Everyone can view feature permissions"
ON public.feature_permissions FOR SELECT
USING (true);

CREATE POLICY "Platform admins can manage feature permissions"
ON public.feature_permissions FOR ALL
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

-- 8. Helper function to check if feature is enabled for org
CREATE OR REPLACE FUNCTION public.is_feature_enabled_for_org(
  _org_id UUID,
  _feature_key TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_enabled FROM public.org_feature_access 
     WHERE org_id = _org_id AND feature_key = _feature_key),
    true
  );
$$;

-- 9. Helper function to check designation feature access
CREATE OR REPLACE FUNCTION public.designation_has_feature_access(
  _designation_id UUID,
  _feature_key TEXT,
  _permission TEXT DEFAULT 'view'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_access BOOLEAN;
BEGIN
  SELECT 
    CASE _permission
      WHEN 'view' THEN can_view
      WHEN 'create' THEN can_create
      WHEN 'edit' THEN can_edit
      WHEN 'delete' THEN can_delete
      ELSE false
    END
  INTO has_access
  FROM public.designation_feature_access
  WHERE designation_id = _designation_id 
    AND feature_key = _feature_key;
  
  RETURN COALESCE(has_access, true);
END;
$$;

-- 10. Seed default features
INSERT INTO public.feature_permissions (feature_key, feature_name, feature_description, category, is_premium) VALUES
('contacts', 'Contacts Management', 'Create and manage contacts', 'core', false),
('pipeline', 'Pipeline Management', 'Manage sales pipeline and stages', 'core', false),
('campaigns_email', 'Email Campaigns', 'Create and send bulk email campaigns', 'communication', true),
('campaigns_whatsapp', 'WhatsApp Campaigns', 'Create and send WhatsApp campaigns', 'communication', true),
('calling', 'Calling', 'Make and log calls', 'communication', false),
('analytics', 'Analytics & Reports', 'View analytics and reports', 'analytics', true),
('ai_insights', 'AI Insights', 'Access AI-powered campaign insights', 'analytics', true),
('forms', 'Form Builder', 'Create and manage forms', 'core', false),
('templates', 'Template Management', 'Manage email and message templates', 'communication', false),
('teams', 'Team Management', 'Manage teams and members', 'admin', false),
('custom_fields', 'Custom Fields', 'Create custom fields for contacts', 'admin', false),
('designations', 'Designations', 'Manage organizational designations', 'admin', false)
ON CONFLICT (feature_key) DO NOTHING;

-- 11. Add updated_at trigger for org_feature_access
CREATE TRIGGER update_org_feature_access_updated_at
BEFORE UPDATE ON public.org_feature_access
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 12. Add updated_at trigger for designation_feature_access
CREATE TRIGGER update_designation_feature_access_updated_at
BEFORE UPDATE ON public.designation_feature_access
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();