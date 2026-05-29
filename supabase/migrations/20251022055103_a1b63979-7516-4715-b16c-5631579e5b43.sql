-- Create a table to track enrichment runs for monitoring
CREATE TABLE IF NOT EXISTS public.contact_enrichment_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  contacts_processed INTEGER DEFAULT 0,
  contacts_enriched INTEGER DEFAULT 0,
  contacts_failed INTEGER DEFAULT 0,
  credits_used INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on enrichment runs
ALTER TABLE public.contact_enrichment_runs ENABLE ROW LEVEL SECURITY;

-- RLS policy for enrichment runs
CREATE POLICY "Users can view their org's enrichment runs"
  ON public.contact_enrichment_runs
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_enrichment_runs_org_started 
  ON public.contact_enrichment_runs(org_id, started_at DESC);