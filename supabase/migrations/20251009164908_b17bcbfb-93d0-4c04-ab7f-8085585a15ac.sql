-- Add inbound routing fields to email_settings table
ALTER TABLE public.email_settings
ADD COLUMN IF NOT EXISTS inbound_route_id text,
ADD COLUMN IF NOT EXISTS inbound_routing_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS inbound_webhook_url text;