
-- Add source column to track which platform submitted the ticket
ALTER TABLE public.support_tickets 
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'crm';

-- Add comment for clarity
COMMENT ON COLUMN public.support_tickets.source IS 'Source platform: crm, paisaa_saarthi, redefine, smb_connect, website, etc.';
