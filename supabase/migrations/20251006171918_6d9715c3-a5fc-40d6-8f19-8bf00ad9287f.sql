
-- Drop the existing policy
DROP POLICY IF EXISTS "Admins can manage roles in their org" ON public.user_roles;

-- Recreate it with platform admin support
CREATE POLICY "Admins can manage roles in their org" 
ON public.user_roles 
FOR ALL 
USING (
  -- Platform admins can manage all roles
  is_platform_admin(auth.uid())
  OR
  -- Regular admins can only manage roles in their org
  (
    (org_id = get_user_org_id(auth.uid())) 
    AND 
    (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  )
);
