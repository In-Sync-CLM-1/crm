-- Add foreign key constraints and indexes for user_roles and profiles

-- 1. Ensure the user_roles table has a proper foreign key to profiles
-- Drop existing constraint if it exists and recreate
ALTER TABLE public.user_roles 
DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;

ALTER TABLE public.user_roles 
ADD CONSTRAINT user_roles_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. Ensure profiles table references auth.users
-- Drop existing constraint if it exists and recreate
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_id_fkey 
FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. Create index for better performance on user_roles lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

-- 4. Create index for better performance on profiles lookups
CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON public.profiles(org_id);