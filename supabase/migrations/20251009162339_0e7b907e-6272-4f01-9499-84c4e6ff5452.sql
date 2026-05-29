-- Add reply_to_email column to email_conversations table
ALTER TABLE email_conversations 
ADD COLUMN reply_to_email TEXT;