-- Create import_jobs table for tracking bulk uploads
CREATE TABLE import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL,
  
  -- File information
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  
  -- Job status
  status TEXT NOT NULL DEFAULT 'pending',
  current_stage TEXT DEFAULT 'pending',
  
  -- Progress tracking
  total_rows INTEGER DEFAULT 0,
  processed_rows INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  
  -- Error and stage details
  error_details JSONB DEFAULT '[]'::jsonb,
  stage_details JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- File cleanup tracking
  file_cleaned_up BOOLEAN DEFAULT false,
  file_cleanup_at TIMESTAMP WITH TIME ZONE,
  
  -- Import target info
  import_type TEXT NOT NULL,
  target_id UUID
);

-- Enable RLS
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can create their own import jobs"
ON import_jobs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can view their own import jobs"
ON import_jobs FOR SELECT TO authenticated
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can update their own import jobs"
ON import_jobs FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Service role can manage all import jobs"
ON import_jobs FOR ALL TO service_role
USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.import_jobs;

-- Create indexes for performance
CREATE INDEX idx_import_jobs_org_user ON import_jobs(org_id, user_id, created_at DESC);
CREATE INDEX idx_import_jobs_status ON import_jobs(status, current_stage);

-- Create storage bucket for CSV uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('bulk-imports', 'bulk-imports', false);

-- RLS: Users can upload to their own folder
CREATE POLICY "Users can upload their own files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'bulk-imports' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: Users can read their own files
CREATE POLICY "Users can read their own files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'bulk-imports' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: Service role can manage all files
CREATE POLICY "Service role can manage all files"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'bulk-imports');