-- Add is_active column to profiles table for soft delete functionality
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON public.profiles(is_active);

-- Add is_active to user_roles table as well
ALTER TABLE public.user_roles
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_user_roles_is_active ON public.user_roles(is_active);