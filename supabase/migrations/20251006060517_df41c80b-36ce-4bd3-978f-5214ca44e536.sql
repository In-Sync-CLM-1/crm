-- Add communication enablement fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS calling_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN DEFAULT false;