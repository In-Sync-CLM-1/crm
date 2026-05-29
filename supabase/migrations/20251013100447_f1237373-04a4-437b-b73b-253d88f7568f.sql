-- Fix cleanup_orphaned_profile function to resolve ambiguous user_id reference
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_profile(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
BEGIN
  -- Delete from user_roles first (if any exist) - fully qualify to avoid ambiguity
  DELETE FROM public.user_roles WHERE user_roles.user_id = cleanup_orphaned_profile.user_id;
  
  -- Delete profile
  DELETE FROM public.profiles WHERE profiles.id = cleanup_orphaned_profile.user_id;
  
  -- Delete from auth.users (cascades will handle remaining references)
  DELETE FROM auth.users WHERE users.id = cleanup_orphaned_profile.user_id;
END;
$$;