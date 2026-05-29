-- Create security definer function to check import job creation permission
CREATE OR REPLACE FUNCTION public.can_create_import_job(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
      AND (org_id = _org_id OR is_platform_admin = true)
      AND is_active = true
  )
$$;

-- Drop existing policy
DROP POLICY IF EXISTS "Users can create import jobs for their org or admins can create" ON import_jobs;

-- Create new simplified policy using the security definer function
CREATE POLICY "Users can create import jobs for their org"
ON import_jobs
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  AND public.can_create_import_job(auth.uid(), org_id)
);