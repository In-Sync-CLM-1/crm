-- Add LinkedIn profile URL to contacts table
ALTER TABLE public.contacts
ADD COLUMN linkedin_url text;