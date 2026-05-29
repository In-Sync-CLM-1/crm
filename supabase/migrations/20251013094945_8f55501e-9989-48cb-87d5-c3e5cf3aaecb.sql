-- Function to generate unique organization slugs
CREATE OR REPLACE FUNCTION public.generate_unique_slug(base_slug TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  final_slug TEXT;
  counter INT := 1;
BEGIN
  final_slug := base_slug;
  
  -- Keep trying until we find a unique slug
  WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = final_slug) LOOP
    final_slug := base_slug || '-' || counter;
    counter := counter + 1;
  END LOOP;
  
  RETURN final_slug;
END;
$$;

-- Function to cleanup orphaned user accounts (users with null org_id)
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_profile(user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, auth
AS $$
BEGIN
  -- Delete from user_roles first (if any exist)
  DELETE FROM public.user_roles WHERE user_id = cleanup_orphaned_profile.user_id;
  
  -- Delete profile
  DELETE FROM public.profiles WHERE id = cleanup_orphaned_profile.user_id;
  
  -- Delete from auth.users (cascades will handle remaining references)
  DELETE FROM auth.users WHERE id = cleanup_orphaned_profile.user_id;
END;
$$;

-- Function to get orphaned profiles (profiles without org_id)
CREATE OR REPLACE FUNCTION public.get_orphaned_profiles()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as user_id,
    u.email,
    p.first_name,
    p.last_name,
    p.created_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.org_id IS NULL 
    AND p.is_platform_admin IS NOT TRUE
  ORDER BY p.created_at DESC;
END;
$$;