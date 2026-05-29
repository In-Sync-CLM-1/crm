-- Migration to auto-populate contact_emails and contact_phones from legacy fields

-- Create function to auto-populate contact emails and phones
CREATE OR REPLACE FUNCTION public.auto_populate_contact_communications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Auto-populate contact_emails if email exists
  IF NEW.email IS NOT NULL AND NEW.email != '' THEN
    INSERT INTO public.contact_emails (contact_id, org_id, email, email_type, is_primary)
    VALUES (NEW.id, NEW.org_id, NEW.email, 'work', true)
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Auto-populate contact_phones if phone exists
  IF NEW.phone IS NOT NULL AND NEW.phone != '' THEN
    INSERT INTO public.contact_phones (contact_id, org_id, phone, phone_type, is_primary)
    VALUES (NEW.id, NEW.org_id, NEW.phone, 'mobile', true)
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to auto-populate on contact insert
DROP TRIGGER IF EXISTS auto_populate_contact_comms_trigger ON public.contacts;
CREATE TRIGGER auto_populate_contact_comms_trigger
  AFTER INSERT ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_populate_contact_communications();

-- Backfill existing contacts - migrate emails
INSERT INTO public.contact_emails (contact_id, org_id, email, email_type, is_primary)
SELECT id, org_id, email, 'work', true
FROM public.contacts
WHERE email IS NOT NULL 
  AND email != ''
  AND NOT EXISTS (
    SELECT 1 FROM public.contact_emails WHERE contact_id = contacts.id
  );

-- Backfill existing contacts - migrate phones
INSERT INTO public.contact_phones (contact_id, org_id, phone, phone_type, is_primary)
SELECT id, org_id, phone, 'mobile', true
FROM public.contacts
WHERE phone IS NOT NULL 
  AND phone != ''
  AND NOT EXISTS (
    SELECT 1 FROM public.contact_phones WHERE contact_id = contacts.id
  );