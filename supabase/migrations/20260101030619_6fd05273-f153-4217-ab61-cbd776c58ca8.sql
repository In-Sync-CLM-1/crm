-- Add priority column to contact_activities
ALTER TABLE public.contact_activities 
ADD COLUMN priority TEXT DEFAULT 'normal' CHECK (priority IN ('urgent', 'important', 'normal'));