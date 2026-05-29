-- Migrate existing contact emails to contact_emails table
INSERT INTO contact_emails (contact_id, org_id, email, email_type, is_primary)
SELECT id, org_id, email, 'work', true
FROM contacts
WHERE email IS NOT NULL 
  AND email != ''
  AND NOT EXISTS (
    SELECT 1 FROM contact_emails 
    WHERE contact_emails.contact_id = contacts.id
  );

-- Migrate existing contact phones to contact_phones table
INSERT INTO contact_phones (contact_id, org_id, phone, phone_type, is_primary)
SELECT id, org_id, phone, 'mobile', true
FROM contacts
WHERE phone IS NOT NULL 
  AND phone != ''
  AND NOT EXISTS (
    SELECT 1 FROM contact_phones 
    WHERE contact_phones.contact_id = contacts.id
  );

-- Note: contacts.email and contacts.phone columns are kept for backward compatibility
-- but should no longer be used in the application. They can be dropped in a future migration.