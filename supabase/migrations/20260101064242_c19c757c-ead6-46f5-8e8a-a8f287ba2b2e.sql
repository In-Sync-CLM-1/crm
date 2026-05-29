-- Add status tracking columns to clients table
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'churned'));
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

-- Create index for status filtering
CREATE INDEX IF NOT EXISTS idx_clients_status ON public.clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_org_status ON public.clients(org_id, status);