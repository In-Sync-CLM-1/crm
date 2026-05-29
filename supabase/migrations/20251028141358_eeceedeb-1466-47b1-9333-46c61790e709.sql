-- Add button_clicks tracking field to email_conversations
ALTER TABLE email_conversations 
ADD COLUMN IF NOT EXISTS button_clicks JSONB DEFAULT '[]'::jsonb;

-- Create index for efficient button click queries
CREATE INDEX IF NOT EXISTS idx_email_conversations_button_clicks 
ON email_conversations USING gin(button_clicks);

-- Add comment explaining the structure
COMMENT ON COLUMN email_conversations.button_clicks IS 'Array of button click events: [{"button_id": "btn-1", "button_text": "Get Started", "clicked_at": "2025-01-15T10:30:00Z"}]';