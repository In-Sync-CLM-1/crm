-- Remove public insert policies that allow database flooding
DROP POLICY IF EXISTS "Public can create contacts via forms" ON public.contacts;
DROP POLICY IF EXISTS "Public can insert contact custom fields" ON public.contact_custom_fields;

-- Create a more restrictive policy that only allows inserts through the edge function
-- (The edge function will use service role key to bypass RLS)
CREATE POLICY "Only authenticated users can create contacts"
  ON public.contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (org_id = get_user_org_id(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Only authenticated users can create contact custom fields"
  ON public.contact_custom_fields
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM contacts
    WHERE contacts.id = contact_custom_fields.contact_id
    AND contacts.org_id = get_user_org_id(auth.uid())
  ));