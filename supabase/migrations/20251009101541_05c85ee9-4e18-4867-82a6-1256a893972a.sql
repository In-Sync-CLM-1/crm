-- Phase 1: Modify whatsapp_messages table for inbound/outbound support
ALTER TABLE whatsapp_messages 
ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
ADD COLUMN IF NOT EXISTS conversation_id TEXT,
ADD COLUMN IF NOT EXISTS replied_to_message_id UUID REFERENCES whatsapp_messages(id),
ADD COLUMN IF NOT EXISTS sender_name TEXT,
ADD COLUMN IF NOT EXISTS media_url TEXT,
ADD COLUMN IF NOT EXISTS media_type TEXT;

-- Create indexes for inbox queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation 
ON whatsapp_messages(conversation_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_direction 
ON whatsapp_messages(org_id, direction, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_unread 
ON whatsapp_messages(org_id, read_at, sent_at DESC) 
WHERE read_at IS NULL AND direction = 'inbound';

-- Phase 2: Create email_conversations table
CREATE TABLE IF NOT EXISTS email_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  contact_id UUID REFERENCES contacts(id),
  
  -- Thread identification
  conversation_id UUID NOT NULL,
  thread_id TEXT,
  
  -- Email details
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_email TEXT NOT NULL,
  cc_emails TEXT[],
  bcc_emails TEXT[],
  subject TEXT NOT NULL,
  email_content TEXT NOT NULL,
  html_content TEXT,
  
  -- Attachments
  has_attachments BOOLEAN DEFAULT FALSE,
  attachments JSONB,
  
  -- Status tracking
  status TEXT DEFAULT 'pending',
  is_read BOOLEAN DEFAULT FALSE,
  
  -- Threading
  replied_to_message_id UUID REFERENCES email_conversations(id),
  
  -- Provider tracking
  provider_message_id TEXT,
  
  -- User tracking
  sent_by UUID REFERENCES auth.users(id),
  
  -- Timestamps
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  received_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for email_conversations
CREATE INDEX IF NOT EXISTS idx_email_conversations_org_direction 
ON email_conversations(org_id, direction, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_conversations_contact 
ON email_conversations(contact_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_conversations_thread 
ON email_conversations(conversation_id, sent_at ASC);

CREATE INDEX IF NOT EXISTS idx_email_conversations_unread 
ON email_conversations(org_id, is_read, sent_at DESC) 
WHERE is_read = FALSE AND direction = 'inbound';

-- Enable RLS on email_conversations
ALTER TABLE email_conversations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for email_conversations
CREATE POLICY "Users can view email conversations in their org"
ON email_conversations FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can send email conversations in their org"
ON email_conversations FOR INSERT
WITH CHECK (org_id = get_user_org_id(auth.uid()) AND sent_by = auth.uid());

CREATE POLICY "Users can update email conversations in their org"
ON email_conversations FOR UPDATE
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Service role can manage all email conversations"
ON email_conversations FOR ALL
USING (true)
WITH CHECK (true);

-- Phase 3: Create unified inbox function
CREATE OR REPLACE FUNCTION get_unified_inbox(p_org_id UUID, p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id UUID,
  conversation_id TEXT,
  contact_id UUID,
  channel TEXT,
  direction TEXT,
  sender_name TEXT,
  preview TEXT,
  is_read BOOLEAN,
  sent_at TIMESTAMPTZ,
  contact_name TEXT,
  phone_number TEXT,
  email_address TEXT
) 
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    wm.id,
    wm.conversation_id::TEXT,
    wm.contact_id,
    'whatsapp'::TEXT as channel,
    wm.direction,
    wm.sender_name,
    LEFT(wm.message_content, 100) as preview,
    COALESCE(wm.read_at IS NOT NULL, FALSE) as is_read,
    wm.sent_at,
    COALESCE(c.first_name || ' ' || COALESCE(c.last_name, ''), wm.sender_name) as contact_name,
    wm.phone_number,
    NULL::TEXT as email_address
  FROM whatsapp_messages wm
  LEFT JOIN contacts c ON c.id = wm.contact_id
  WHERE wm.org_id = p_org_id
  
  UNION ALL
  
  SELECT 
    ec.id,
    ec.conversation_id::TEXT,
    ec.contact_id,
    'email'::TEXT as channel,
    ec.direction,
    ec.from_name as sender_name,
    LEFT(ec.subject || ': ' || ec.email_content, 100) as preview,
    ec.is_read,
    ec.sent_at,
    COALESCE(c.first_name || ' ' || COALESCE(c.last_name, ''), ec.from_name) as contact_name,
    NULL::TEXT as phone_number,
    ec.from_email as email_address
  FROM email_conversations ec
  LEFT JOIN contacts c ON c.id = ec.contact_id
  WHERE ec.org_id = p_org_id
  
  ORDER BY sent_at DESC
  LIMIT p_limit;
END;
$$;

-- Add trigger for updated_at on email_conversations
CREATE TRIGGER update_email_conversations_updated_at
BEFORE UPDATE ON email_conversations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE email_conversations;