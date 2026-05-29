-- Fix RLS policies for organizations to allow creation during signup
DROP POLICY IF EXISTS "Users can view their own organization" ON public.organizations;
DROP POLICY IF EXISTS "Users can update their own organization" ON public.organizations;
DROP POLICY IF EXISTS "Admins can update their organization" ON public.organizations;
DROP POLICY IF EXISTS "Users can create organization during signup" ON public.organizations;
DROP POLICY IF EXISTS "Users can view own organization" ON public.organizations;

-- Allow users to insert their own organization during signup
CREATE POLICY "Users can create organization"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow users to view their organization
CREATE POLICY "Users can view their organization"
ON public.organizations
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- Allow users to update their organization if they are admin
CREATE POLICY "Admins can update organization"
ON public.organizations
FOR UPDATE
TO authenticated
USING (
  id IN (
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  id IN (
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  )
);