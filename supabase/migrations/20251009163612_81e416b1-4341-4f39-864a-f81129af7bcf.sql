-- Create function to sync outbound emails to contact activities
CREATE OR REPLACE FUNCTION sync_outbound_email_to_activity()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create activity for outbound emails with a valid contact_id
  IF NEW.direction = 'outbound' AND NEW.contact_id IS NOT NULL THEN
    INSERT INTO contact_activities (
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
      NEW.contact_id,
      'email',
      NEW.subject,
      'Sent email: ' || LEFT(NEW.email_content, 200) || CASE WHEN LENGTH(NEW.email_content) > 200 THEN '...' ELSE '' END,
      NEW.sent_by,
      NEW.sent_at,
      NEW.sent_at
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for outbound emails
CREATE TRIGGER sync_outbound_email_trigger
AFTER INSERT ON email_conversations
FOR EACH ROW
WHEN (NEW.direction = 'outbound' AND NEW.contact_id IS NOT NULL)
EXECUTE FUNCTION sync_outbound_email_to_activity();

-- Create function to sync inbound emails (replies) to contact activities
CREATE OR REPLACE FUNCTION sync_inbound_email_to_activity()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create activity for inbound emails with a valid contact_id
  IF NEW.direction = 'inbound' AND NEW.contact_id IS NOT NULL THEN
    INSERT INTO contact_activities (
      org_id,
      contact_id,
      activity_type,
      subject,
      description,
      created_at,
      completed_at
    ) VALUES (
      NEW.org_id,
      NEW.contact_id,
      'email',
      'Reply: ' || NEW.subject,
      'Received email reply: ' || LEFT(NEW.email_content, 200) || CASE WHEN LENGTH(NEW.email_content) > 200 THEN '...' ELSE '' END,
      COALESCE(NEW.received_at, NEW.created_at),
      COALESCE(NEW.received_at, NEW.created_at)
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for inbound emails
CREATE TRIGGER sync_inbound_email_trigger
AFTER INSERT ON email_conversations
FOR EACH ROW
WHEN (NEW.direction = 'inbound' AND NEW.contact_id IS NOT NULL)
EXECUTE FUNCTION sync_inbound_email_to_activity();

-- Backfill outbound emails (sent by users)
INSERT INTO contact_activities (
  org_id,
  contact_id,
  activity_type,
  subject,
  description,
  created_by,
  created_at,
  completed_at
)
SELECT 
  ec.org_id,
  ec.contact_id,
  'email'::text,
  ec.subject,
  'Sent email: ' || LEFT(ec.email_content, 200) || CASE WHEN LENGTH(ec.email_content) > 200 THEN '...' ELSE '' END,
  ec.sent_by,
  ec.sent_at,
  ec.sent_at
FROM email_conversations ec
WHERE ec.direction = 'outbound'
AND ec.contact_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM contact_activities ca 
  WHERE ca.contact_id = ec.contact_id 
  AND ca.activity_type = 'email'
  AND ca.created_at = ec.sent_at
  AND ca.subject = ec.subject
)
ORDER BY ec.sent_at;

-- Backfill inbound emails (replies from contacts)
INSERT INTO contact_activities (
  org_id,
  contact_id,
  activity_type,
  subject,
  description,
  created_at,
  completed_at
)
SELECT 
  ec.org_id,
  ec.contact_id,
  'email'::text,
  'Reply: ' || ec.subject,
  'Received email reply: ' || LEFT(ec.email_content, 200) || CASE WHEN LENGTH(ec.email_content) > 200 THEN '...' ELSE '' END,
  COALESCE(ec.received_at, ec.created_at),
  COALESCE(ec.received_at, ec.created_at)
FROM email_conversations ec
WHERE ec.direction = 'inbound'
AND ec.contact_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM contact_activities ca 
  WHERE ca.contact_id = ec.contact_id 
  AND ca.activity_type = 'email'
  AND ca.created_at = COALESCE(ec.received_at, ec.created_at)
  AND ca.subject = 'Reply: ' || ec.subject
)
ORDER BY COALESCE(ec.received_at, ec.created_at);