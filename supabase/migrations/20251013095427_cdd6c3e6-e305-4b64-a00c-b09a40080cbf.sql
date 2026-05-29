-- Fix get_orphaned_profiles function to properly cast email type
CREATE OR REPLACE FUNCTION public.get_orphaned_profiles()
RETURNS TABLE(
  user_id uuid, 
  email text, 
  first_name text, 
  last_name text, 
  created_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as user_id,
    u.email::text,
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