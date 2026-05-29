-- Add platform admin flag to profiles
ALTER TABLE public.profiles
ADD COLUMN is_platform_admin boolean DEFAULT false;

-- Create platform_admin_audit_log table for tracking admin actions
CREATE TABLE public.platform_admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  target_org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  details jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.platform_admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Only platform admins can view audit logs
CREATE POLICY "Platform admins can view audit logs"
ON public.platform_admin_audit_log
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.is_platform_admin = true
  )
);

-- Platform admins can insert audit logs
CREATE POLICY "Platform admins can insert audit logs"
ON public.platform_admin_audit_log
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.is_platform_admin = true
  ) AND admin_id = auth.uid()
);

-- Create function to check platform admin status
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM public.profiles WHERE id = _user_id),
    false
  )
$$;

-- Update profiles RLS to allow platform admins to view all profiles
CREATE POLICY "Platform admins can view all profiles"
ON public.profiles
FOR SELECT
USING (is_platform_admin(auth.uid()));

-- Update organizations RLS to allow platform admins to view all organizations
CREATE POLICY "Platform admins can view all organizations"
ON public.organizations
FOR SELECT
USING (is_platform_admin(auth.uid()));

-- Update organizations RLS to allow platform admins to manage organizations
CREATE POLICY "Platform admins can update all organizations"
ON public.organizations
FOR UPDATE
USING (is_platform_admin(auth.uid()));

-- Platform admins can view all user roles
CREATE POLICY "Platform admins can view all user roles"
ON public.user_roles
FOR SELECT
USING (is_platform_admin(auth.uid()));

-- Create indexes
CREATE INDEX idx_platform_admin_audit_log_admin_id ON public.platform_admin_audit_log(admin_id);
CREATE INDEX idx_platform_admin_audit_log_target_org_id ON public.platform_admin_audit_log(target_org_id);
CREATE INDEX idx_profiles_is_platform_admin ON public.profiles(is_platform_admin) WHERE is_platform_admin = true;