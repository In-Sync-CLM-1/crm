-- Add GPS fields to contacts table
ALTER TABLE public.contacts 
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8),
ADD COLUMN IF NOT EXISTS last_verified_location_at TIMESTAMP WITH TIME ZONE;

-- Add GPS fields to contact_activities table
ALTER TABLE public.contact_activities 
ADD COLUMN IF NOT EXISTS check_in_latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS check_in_longitude DECIMAL(11, 8),
ADD COLUMN IF NOT EXISTS check_out_latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS check_out_longitude DECIMAL(11, 8),
ADD COLUMN IF NOT EXISTS location_accuracy DECIMAL(6, 2),
ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

-- Create indexes for location-based queries
CREATE INDEX IF NOT EXISTS idx_contacts_location 
ON public.contacts (latitude, longitude) 
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contact_activities_checkin_location 
ON public.contact_activities (check_in_latitude, check_in_longitude) 
WHERE check_in_latitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contact_activities_checkout_location 
ON public.contact_activities (check_out_latitude, check_out_longitude) 
WHERE check_out_latitude IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.contacts.last_verified_location_at IS 'Timestamp of last field visit check-out (latest GPS verification)';
COMMENT ON COLUMN public.contact_activities.duration_minutes IS 'Duration of visit in minutes (check-out time - check-in time)';