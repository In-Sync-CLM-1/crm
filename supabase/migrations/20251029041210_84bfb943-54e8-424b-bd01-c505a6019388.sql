-- Create trigger function to sync primary email from contact_emails to contacts
CREATE OR REPLACE FUNCTION sync_primary_email_to_contact()
RETURNS TRIGGER AS $$
BEGIN
  -- If a primary email is being set
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.is_primary = true THEN
      -- Update the contact's email field
      UPDATE contacts 
      SET email = NEW.email, updated_at = now()
      WHERE id = NEW.contact_id AND org_id = NEW.org_id;
      
      -- Unset any other primary emails for this contact
      UPDATE contact_emails
      SET is_primary = false
      WHERE contact_id = NEW.contact_id 
        AND org_id = NEW.org_id 
        AND id != NEW.id 
        AND is_primary = true;
    END IF;
  END IF;
  
  -- If a primary email is being deleted, clear the contact's email
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_primary = true THEN
      UPDATE contacts 
      SET email = NULL, updated_at = now()
      WHERE id = OLD.contact_id AND org_id = OLD.org_id;
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on contact_emails table
DROP TRIGGER IF EXISTS trigger_sync_primary_email ON contact_emails;
CREATE TRIGGER trigger_sync_primary_email
  AFTER INSERT OR UPDATE OR DELETE ON contact_emails
  FOR EACH ROW
  EXECUTE FUNCTION sync_primary_email_to_contact();

-- One-time sync: Update all contacts with their current primary email
UPDATE contacts c
SET email = ce.email, updated_at = now()
FROM contact_emails ce
WHERE ce.contact_id = c.id 
  AND ce.org_id = c.org_id 
  AND ce.is_primary = true
  AND (c.email IS NULL OR c.email != ce.email);