-- Fix Critical Security Issues: Remove Public Exposure and Add Defense-in-Depth

-- ============================================================================
-- 1. REMOVE PUBLIC FORM EXPOSURE
-- ============================================================================

-- Drop public view policies on forms table
DROP POLICY IF EXISTS "Public can view active forms" ON public.forms;

-- Drop public view policies on form_fields table  
DROP POLICY IF EXISTS "Public can view form fields" ON public.form_fields;

-- Note: Public form submissions still work via submit-public-form edge function
-- which uses service role key to bypass RLS securely


-- ============================================================================
-- 2. ADD DEFENSE-IN-DEPTH TO PII TABLES
-- ============================================================================

-- Update contacts table policies to require explicit authentication
DROP POLICY IF EXISTS "Users can view contacts in their org" ON public.contacts;
CREATE POLICY "Users can view contacts in their org" 
ON public.contacts 
FOR SELECT 
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND org_id = get_user_org_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.org_id = contacts.org_id
  )
);

DROP POLICY IF EXISTS "Users can update contacts in their org" ON public.contacts;
CREATE POLICY "Users can update contacts in their org" 
ON public.contacts 
FOR UPDATE 
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND org_id = get_user_org_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.org_id = contacts.org_id
  )
);

-- Update contact_emails policies with explicit authentication checks
DROP POLICY IF EXISTS "Users can view emails in their org" ON public.contact_emails;
CREATE POLICY "Users can view emails in their org" 
ON public.contact_emails 
FOR SELECT 
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND org_id = get_user_org_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.org_id = contact_emails.org_id
  )
);

DROP POLICY IF EXISTS "Users can insert emails in their org" ON public.contact_emails;
CREATE POLICY "Users can insert emails in their org" 
ON public.contact_emails 
FOR INSERT 
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND org_id = get_user_org_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.org_id = contact_emails.org_id
  )
);

DROP POLICY IF EXISTS "Users can update emails in their org" ON public.contact_emails;
CREATE POLICY "Users can update emails in their org" 
ON public.contact_emails 
FOR UPDATE 
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND org_id = get_user_org_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.org_id = contact_emails.org_id
  )
);

DROP POLICY IF EXISTS "Users can delete emails in their org" ON public.contact_emails;
CREATE POLICY "Users can delete emails in their org" 
ON public.contact_emails 
FOR DELETE 
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND org_id = get_user_org_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.org_id = contact_emails.org_id
  )
);

-- Update contact_phones policies with explicit authentication checks
DROP POLICY IF EXISTS "Users can view phones in their org" ON public.contact_phones;
CREATE POLICY "Users can view phones in their org" 
ON public.contact_phones 
FOR SELECT 
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND org_id = get_user_org_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.org_id = contact_phones.org_id
  )
);

DROP POLICY IF EXISTS "Users can insert phones in their org" ON public.contact_phones;
CREATE POLICY "Users can insert phones in their org" 
ON public.contact_phones 
FOR INSERT 
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND org_id = get_user_org_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.org_id = contact_phones.org_id
  )
);

DROP POLICY IF EXISTS "Users can update phones in their org" ON public.contact_phones;
CREATE POLICY "Users can update phones in their org" 
ON public.contact_phones 
FOR UPDATE 
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND org_id = get_user_org_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.org_id = contact_phones.org_id
  )
);

DROP POLICY IF EXISTS "Users can delete phones in their org" ON public.contact_phones;
CREATE POLICY "Users can delete phones in their org" 
ON public.contact_phones 
FOR DELETE 
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND org_id = get_user_org_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.org_id = contact_phones.org_id
  )
);