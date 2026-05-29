-- Create function to handle complete organization setup after user signup
-- This runs with SECURITY DEFINER to bypass RLS policies
CREATE OR REPLACE FUNCTION public.create_organization_for_user(
  p_user_id uuid,
  p_org_name text,
  p_org_slug text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id uuid;
  v_unique_slug text;
BEGIN
  -- Generate unique slug if needed
  v_unique_slug := generate_unique_slug(p_org_slug);
  
  -- Create organization
  INSERT INTO public.organizations (name, slug)
  VALUES (p_org_name, v_unique_slug)
  RETURNING id INTO v_org_id;
  
  -- Update profile with org_id
  UPDATE public.profiles
  SET org_id = v_org_id
  WHERE id = p_user_id;
  
  -- Assign admin role
  INSERT INTO public.user_roles (user_id, org_id, role)
  VALUES (p_user_id, v_org_id, 'admin');
  
  -- Create default pipeline stages
  PERFORM create_default_pipeline_stages(v_org_id);
  
  -- Create default call dispositions
  PERFORM create_default_call_dispositions(v_org_id);
  
  RETURN v_org_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Organization name or URL is already taken';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to create organization: %', SQLERRM;
END;
$$;