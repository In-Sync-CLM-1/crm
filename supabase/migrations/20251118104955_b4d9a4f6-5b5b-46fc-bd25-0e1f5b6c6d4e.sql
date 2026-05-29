-- Drop the phone uniqueness constraint to allow duplicate phones
ALTER TABLE public.contacts 
  DROP CONSTRAINT IF EXISTS unique_phone_per_org;