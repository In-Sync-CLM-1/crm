-- Fix Critical Security Issue #1: Remove Public Data Exposure
-- This migration removes all public SELECT policies from sensitive tables

-- 1. Drop public SELECT policy from custom_fields table
DROP POLICY IF EXISTS "Public can view active custom fields" ON public.custom_fields;

-- 2. Ensure all sensitive tables have proper RLS policies only for authenticated users
-- No changes needed for profiles, contact_emails, contact_phones, contact_activities, organizations
-- as they already have organization-scoped policies. This migration just removes any public access.

-- 3. Add explicit comment to document the security fix
COMMENT ON TABLE public.profiles IS 'Contains employee personal information - restricted to organization members only';
COMMENT ON TABLE public.contact_emails IS 'Contains customer contact data - restricted to organization members only';
COMMENT ON TABLE public.contact_phones IS 'Contains customer contact data - restricted to organization members only';
COMMENT ON TABLE public.contact_activities IS 'Contains sales activity data - restricted to organization members only';
COMMENT ON TABLE public.organizations IS 'Contains company configuration - restricted to organization members only';
COMMENT ON TABLE public.custom_fields IS 'Contains business process configuration - restricted to organization members only';