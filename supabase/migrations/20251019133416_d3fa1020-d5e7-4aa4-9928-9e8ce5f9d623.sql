-- Add user_email column to google_oauth_tokens table to store connected Google account
ALTER TABLE public.google_oauth_tokens 
ADD COLUMN IF NOT EXISTS user_email TEXT;