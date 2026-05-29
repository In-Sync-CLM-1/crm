-- Fix remaining database function missing search_path
-- This secures the update_updated_at_column trigger function

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_updated_at_column() IS 'Trigger function to auto-update updated_at timestamps - SECURITY DEFINER with locked search_path';