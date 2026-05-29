-- Add WhatsApp-specific fields to exotel_settings table
ALTER TABLE public.exotel_settings 
ADD COLUMN IF NOT EXISTS whatsapp_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS whatsapp_source_number text,
ADD COLUMN IF NOT EXISTS waba_id text;

-- Add exotel_message_id column to whatsapp_messages table (replacing gupshup_message_id)
ALTER TABLE public.whatsapp_messages 
ADD COLUMN IF NOT EXISTS exotel_message_id text,
ADD COLUMN IF NOT EXISTS exotel_status_code text;

-- Update whatsapp_bulk_campaigns to reference exotel_settings instead of whatsapp_settings
ALTER TABLE public.whatsapp_bulk_campaigns 
ADD COLUMN IF NOT EXISTS exotel_settings_id uuid REFERENCES public.exotel_settings(id);

-- Create index on exotel_message_id for faster webhook lookups
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_exotel_message_id ON public.whatsapp_messages(exotel_message_id);

-- Add comment for clarity
COMMENT ON COLUMN public.exotel_settings.whatsapp_enabled IS 'Enable WhatsApp messaging via Exotel';
COMMENT ON COLUMN public.exotel_settings.whatsapp_source_number IS 'WhatsApp Business number for sending messages';
COMMENT ON COLUMN public.exotel_settings.waba_id IS 'WhatsApp Business Account ID for template sync';