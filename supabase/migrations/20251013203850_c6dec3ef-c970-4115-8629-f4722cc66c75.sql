-- Create the redefine_data_repository table
CREATE TABLE redefine_data_repository (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Personal Information
  name TEXT NOT NULL,
  designation TEXT,
  department TEXT,
  job_level TEXT,
  linkedin_url TEXT,
  mobile_number TEXT,
  mobile_2 TEXT,
  official_email TEXT,
  personal_email TEXT,
  generic_email TEXT,
  
  -- Company Information
  industry_type TEXT,
  sub_industry TEXT,
  company_name TEXT,
  address TEXT,
  location TEXT,
  city TEXT,
  state TEXT,
  zone TEXT,
  tier TEXT,
  pincode TEXT,
  website TEXT,
  
  -- Company Metrics
  turnover TEXT,
  employee_size TEXT,
  erp_name TEXT,
  erp_vendor TEXT,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Unique constraint
  CONSTRAINT unique_email_per_org UNIQUE(org_id, official_email)
);

-- Enable RLS
ALTER TABLE redefine_data_repository ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Redefine org only)
CREATE POLICY "Only Redefine org can access repository"
ON redefine_data_repository FOR ALL
TO authenticated
USING (
  org_id = get_user_org_id(auth.uid()) AND
  EXISTS (
    SELECT 1 FROM organizations 
    WHERE id = redefine_data_repository.org_id 
    AND slug = 'redefine-marcom-pvt-ltd'
  )
);

-- Service role policy for bulk imports
CREATE POLICY "Service role can manage all repository data"
ON redefine_data_repository FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Create indexes
CREATE INDEX idx_redefine_repo_org_id ON redefine_data_repository(org_id);
CREATE INDEX idx_redefine_repo_company ON redefine_data_repository(company_name);
CREATE INDEX idx_redefine_repo_created_at ON redefine_data_repository(created_at DESC);
CREATE INDEX idx_redefine_repo_email ON redefine_data_repository(official_email);
CREATE INDEX idx_redefine_repo_mobile ON redefine_data_repository(mobile_number);

-- Create full-text search index
CREATE INDEX idx_redefine_repo_search ON redefine_data_repository 
  USING gin(to_tsvector('english', 
    coalesce(name, '') || ' ' || 
    coalesce(company_name, '') || ' ' ||
    coalesce(designation, '') || ' ' ||
    coalesce(city, '') || ' ' ||
    coalesce(industry_type, '')
  ));

-- Create update trigger
CREATE TRIGGER update_redefine_repository_updated_at
BEFORE UPDATE ON redefine_data_repository
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create audit table for tracking changes
CREATE TABLE redefine_repository_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_record_id UUID REFERENCES redefine_data_repository(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  old_values JSONB,
  new_values JSONB
);

-- Enable RLS on audit table
ALTER TABLE redefine_repository_audit ENABLE ROW LEVEL SECURITY;

-- RLS for audit table
CREATE POLICY "Only Redefine org can view audit logs"
ON redefine_repository_audit FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM redefine_data_repository r
    INNER JOIN profiles p ON p.id = auth.uid()
    WHERE r.id = redefine_repository_audit.repository_record_id
    AND r.org_id = p.org_id
    AND EXISTS (
      SELECT 1 FROM organizations o
      WHERE o.id = p.org_id AND o.slug = 'redefine-marcom-pvt-ltd'
    )
  )
);

-- Create audit trigger function
CREATE OR REPLACE FUNCTION log_redefine_repository_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO redefine_repository_audit (repository_record_id, action, changed_by, old_values)
    VALUES (OLD.id, 'delete', auth.uid(), row_to_json(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO redefine_repository_audit (repository_record_id, action, changed_by, old_values, new_values)
    VALUES (NEW.id, 'update', auth.uid(), row_to_json(OLD), row_to_json(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO redefine_repository_audit (repository_record_id, action, changed_by, new_values)
    VALUES (NEW.id, 'insert', auth.uid(), row_to_json(NEW));
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Attach audit trigger
CREATE TRIGGER redefine_repository_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON redefine_data_repository
FOR EACH ROW EXECUTE FUNCTION log_redefine_repository_changes();

-- Insert feature permission
INSERT INTO feature_permissions (
  feature_key,
  feature_name,
  feature_description,
  category,
  is_premium
) VALUES (
  'redefine_data_repository',
  'Redefine Data Repository',
  'Exclusive data repository for professional contacts and companies',
  'Data Management',
  false
) ON CONFLICT (feature_key) DO NOTHING;

-- Enable feature for Redefine org
INSERT INTO org_feature_access (
  org_id,
  feature_key,
  is_enabled,
  enabled_at
) 
SELECT 
  id,
  'redefine_data_repository',
  true,
  NOW()
FROM organizations 
WHERE slug = 'redefine-marcom-pvt-ltd'
ON CONFLICT (org_id, feature_key) DO UPDATE SET is_enabled = true, enabled_at = NOW();