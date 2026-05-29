-- Allow users to select their own profile (needed for edge functions to get org_id)
-- This prevents circular dependency when edge functions try to fetch org_id
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());