-- Fix the handle_new_user trigger to properly handle org_id from signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_default_role app_role;
BEGIN
  -- Extract org_id from metadata if provided during signup
  v_org_id := (NEW.raw_user_meta_data->>'org_id')::uuid;
  
  -- Insert profile with org_id from metadata
  INSERT INTO public.profiles (id, first_name, last_name, org_id)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    v_org_id
  );

  -- If org_id is set, assign a default role
  IF v_org_id IS NOT NULL THEN
    -- Check if this is the first user in the org (they should be admin)
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles WHERE org_id = v_org_id
    ) THEN
      v_default_role := 'admin'::app_role;
    ELSE
      v_default_role := 'sales_agent'::app_role;
    END IF;

    -- Insert the role (SECURITY DEFINER allows this to bypass RLS)
    INSERT INTO public.user_roles (user_id, org_id, role)
    VALUES (NEW.id, v_org_id, v_default_role);
  END IF;

  RETURN NEW;
END;
$function$;