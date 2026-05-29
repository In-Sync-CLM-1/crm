-- Create function to check admin limit
CREATE OR REPLACE FUNCTION public.check_admin_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_count INTEGER;
BEGIN
  -- Only check if the role being inserted/updated is admin or super_admin
  IF NEW.role IN ('admin', 'super_admin') THEN
    -- Count existing admins for this org (excluding the current record if it's an update)
    SELECT COUNT(*) INTO admin_count
    FROM public.user_roles
    WHERE org_id = NEW.org_id 
      AND role IN ('admin', 'super_admin')
      AND (TG_OP = 'INSERT' OR id != NEW.id);
    
    -- Check if limit would be exceeded
    IF admin_count >= 5 THEN
      RAISE EXCEPTION 'Maximum number of admins (5) reached for this organization';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to enforce admin limit
DROP TRIGGER IF EXISTS enforce_admin_limit ON public.user_roles;
CREATE TRIGGER enforce_admin_limit
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.check_admin_limit();