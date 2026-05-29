-- Add industry_type and nature_of_business columns to contacts table
ALTER TABLE public.contacts 
ADD COLUMN IF NOT EXISTS industry_type TEXT,
ADD COLUMN IF NOT EXISTS nature_of_business TEXT;