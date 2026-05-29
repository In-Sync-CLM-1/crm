-- Fix PUBLIC_USER_DATA: Add explicit authentication requirement to profiles table policies
-- Drop existing policies that don't explicitly check authentication
DROP POLICY IF EXISTS "Users can view profiles in their org" ON public.profiles;
DROP POLICY IF EXISTS "Platform admins can view all profiles" ON public.profiles;

-- Recreate policies with explicit authentication checks
CREATE POLICY "Users can view profiles in their org" 
ON public.profiles 
FOR SELECT 
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND org_id = get_user_org_id(auth.uid())
);

CREATE POLICY "Platform admins can view all profiles" 
ON public.profiles 
FOR SELECT 
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND is_platform_admin(auth.uid())
);

-- Fix EXPOSED_SENSITIVE_DATA: Add explicit authentication requirement to contacts table policies
DROP POLICY IF EXISTS "Users can view contacts in their org" ON public.contacts;

CREATE POLICY "Users can view contacts in their org" 
ON public.contacts 
FOR SELECT 
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND org_id = get_user_org_id(auth.uid()) 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.org_id = contacts.org_id
  )
);

-- Fix MISSING_RLS_PROTECTION: Add explicit authentication requirement to organizations table policies
DROP POLICY IF EXISTS "Users can view their organization" ON public.organizations;
DROP POLICY IF EXISTS "Platform admins can view all organizations" ON public.organizations;

CREATE POLICY "Users can view their organization" 
ON public.organizations 
FOR SELECT 
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND id IN (
    SELECT profiles.org_id 
    FROM profiles 
    WHERE profiles.id = auth.uid()
  )
);

CREATE POLICY "Platform admins can view all organizations" 
ON public.organizations 
FOR SELECT 
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND is_platform_admin(auth.uid())
);