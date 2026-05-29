-- Create a trigger to automatically log contact creation as an activity in the customer journey
-- This ensures that when contacts are created via webhook, form, or manually, 
-- there's always a record showing when they were added to the system

CREATE OR REPLACE FUNCTION public.log_contact_creation_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Create an activity for the contact creation
  INSERT INTO public.contact_activities (
    org_id,
    contact_id,
    activity_type,
    subject,
    description,
    created_by,
    created_at,
    completed_at
  ) VALUES (
    NEW.org_id,
    NEW.id,
    'note',
    'Contact Created',
    'Contact added to system' || 
    CASE 
      WHEN NEW.source IS NOT NULL THEN ' via ' || NEW.source
      ELSE ''
    END,
    NEW.created_by,
    NEW.created_at,
    NEW.created_at
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger that fires after a new contact is inserted
DROP TRIGGER IF EXISTS trigger_log_contact_creation ON public.contacts;
CREATE TRIGGER trigger_log_contact_creation
  AFTER INSERT ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.log_contact_creation_activity();