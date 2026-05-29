-- Create contact_enrichment_logs table
CREATE TABLE IF NOT EXISTS public.contact_enrichment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  enrichment_source TEXT NOT NULL DEFAULT 'apollo',
  enriched_data JSONB,
  fields_enriched TEXT[],
  credits_used INTEGER DEFAULT 0,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  enriched_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_contact_enrichment_logs_org_id ON public.contact_enrichment_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_contact_enrichment_logs_contact_id ON public.contact_enrichment_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_enrichment_logs_created_at ON public.contact_enrichment_logs(created_at DESC);

-- Enable RLS on contact_enrichment_logs
ALTER TABLE public.contact_enrichment_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contact_enrichment_logs
CREATE POLICY "Users can view enrichment logs in their org"
  ON public.contact_enrichment_logs
  FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can create enrichment logs in their org"
  ON public.contact_enrichment_logs
  FOR INSERT
  WITH CHECK (org_id = get_user_org_id(auth.uid()) AND enriched_by = auth.uid());

CREATE POLICY "Service role can manage all enrichment logs"
  ON public.contact_enrichment_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Alter contacts table to add Apollo enrichment fields
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS twitter_url TEXT,
  ADD COLUMN IF NOT EXISTS github_url TEXT,
  ADD COLUMN IF NOT EXISTS facebook_url TEXT,
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS headline TEXT,
  ADD COLUMN IF NOT EXISTS seniority TEXT,
  ADD COLUMN IF NOT EXISTS departments TEXT[],
  ADD COLUMN IF NOT EXISTS person_locations JSONB,
  ADD COLUMN IF NOT EXISTS employment_history JSONB,
  ADD COLUMN IF NOT EXISTS education JSONB,
  ADD COLUMN IF NOT EXISTS phone_numbers JSONB,
  ADD COLUMN IF NOT EXISTS organization_name TEXT,
  ADD COLUMN IF NOT EXISTS organization_founded_year INTEGER,
  ADD COLUMN IF NOT EXISTS organization_industry TEXT,
  ADD COLUMN IF NOT EXISTS organization_keywords TEXT[],
  ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS enrichment_status TEXT,
  ADD COLUMN IF NOT EXISTS apollo_person_id TEXT;

-- Add index on enrichment_status for filtering
CREATE INDEX IF NOT EXISTS idx_contacts_enrichment_status ON public.contacts(enrichment_status);

COMMENT ON COLUMN public.contacts.linkedin_url IS 'LinkedIn profile URL from Apollo';
COMMENT ON COLUMN public.contacts.enrichment_status IS 'Status: pending, enriched, failed, partial, or NULL if never enriched';