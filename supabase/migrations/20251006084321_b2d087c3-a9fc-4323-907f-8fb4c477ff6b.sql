-- Allow public access to view active forms
CREATE POLICY "Public can view active forms"
ON public.forms
FOR SELECT
TO anon
USING (is_active = true);

-- Allow public access to view form fields for active forms
CREATE POLICY "Public can view form fields"
ON public.form_fields
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.forms
    WHERE forms.id = form_fields.form_id
    AND forms.is_active = true
  )
);

-- Allow public access to view custom fields that are active
CREATE POLICY "Public can view active custom fields"
ON public.custom_fields
FOR SELECT
TO anon
USING (is_active = true);

-- Allow public (anon) users to create contacts via forms
CREATE POLICY "Public can create contacts via forms"
ON public.contacts
FOR INSERT
TO anon
WITH CHECK (source = 'web_form');

-- Allow public users to insert custom field values for contacts they create
CREATE POLICY "Public can insert contact custom fields"
ON public.contact_custom_fields
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.contacts
    WHERE contacts.id = contact_custom_fields.contact_id
    AND contacts.source = 'web_form'
  )
);