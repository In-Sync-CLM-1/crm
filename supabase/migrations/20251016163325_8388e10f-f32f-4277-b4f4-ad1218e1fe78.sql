-- Add scheduled_at column to email_conversations table
ALTER TABLE email_conversations 
ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE;

-- Add scheduled_at column to whatsapp_messages table
ALTER TABLE whatsapp_messages 
ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE;

-- Add indexes for efficient scheduled message queries
CREATE INDEX IF NOT EXISTS idx_email_conversations_scheduled 
ON email_conversations(scheduled_at) 
WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_scheduled 
ON whatsapp_messages(scheduled_at) 
WHERE status = 'scheduled';

-- Add index for scheduled campaigns
CREATE INDEX IF NOT EXISTS idx_email_campaigns_scheduled 
ON email_bulk_campaigns(scheduled_at) 
WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_scheduled 
ON whatsapp_bulk_campaigns(scheduled_at) 
WHERE status = 'scheduled';