-- Fix Critical Security Issue #2: RLS Policy Violations on user_roles
-- This fixes the "new row violates row-level security policy for table user_roles" error

-- The problem: New users can't get their initial role assigned because only admins can insert roles
-- Solution: Allow the trigger function to insert initial roles by making it SECURITY DEFINER

-- 1. Update the handle_new_user function to also create initial user_role
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id uuid;
  v_default_role app_role;
BEGIN
  -- Insert profile first
  INSERT INTO public.profiles (id, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );

  -- Get the org_id from the new profile (if it was set via metadata)
  SELECT org_id INTO v_org_id
  FROM public.profiles
  WHERE id = NEW.id;

  -- If org_id is set, assign a default role
  IF v_org_id IS NOT NULL THEN
    -- Check if this is the first user in the org (they should be admin)
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles WHERE org_id = v_org_id
    ) THEN
      v_default_role := 'admin'::app_role;
    ELSE
      v_default_role := 'sales_rep'::app_role;
    END IF;

    -- Insert the role (SECURITY DEFINER allows this to bypass RLS)
    INSERT INTO public.user_roles (user_id, org_id, role)
    VALUES (NEW.id, v_org_id, v_default_role);
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 3. Add a policy to allow service role to manage user_roles during signup
-- This provides additional safety for automated processes
CREATE POLICY "Service role can manage all user roles"
ON public.user_roles
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);