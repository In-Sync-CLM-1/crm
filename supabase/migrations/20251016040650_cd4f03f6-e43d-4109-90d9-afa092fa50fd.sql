-- Add one_time_setup_fee column to organization_subscriptions table
ALTER TABLE public.organization_subscriptions 
ADD COLUMN IF NOT EXISTS one_time_setup_fee NUMERIC DEFAULT 0;

COMMENT ON COLUMN public.organization_subscriptions.one_time_setup_fee IS 'One-time setup fee charged when subscription is created';