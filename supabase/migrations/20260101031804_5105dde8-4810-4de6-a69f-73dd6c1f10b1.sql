-- Make contact_id optional for activities like meetings with non-leads
ALTER TABLE public.contact_activities 
ALTER COLUMN contact_id DROP NOT NULL;