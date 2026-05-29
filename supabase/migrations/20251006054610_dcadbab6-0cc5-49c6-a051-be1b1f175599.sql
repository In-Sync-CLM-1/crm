-- Create contacts/leads table
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  company TEXT,
  job_title TEXT,
  
  -- Lead details
  status TEXT DEFAULT 'new', -- new, contacted, qualified, converted, lost
  source TEXT, -- web, referral, cold_call, etc.
  pipeline_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  
  -- Assignment
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  
  -- Additional info
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  postal_code TEXT,
  website TEXT,
  notes TEXT,
  
  -- Metadata
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index for performance
CREATE INDEX idx_contacts_org_id ON public.contacts(org_id);
CREATE INDEX idx_contacts_assigned_to ON public.contacts(assigned_to);
CREATE INDEX idx_contacts_assigned_team ON public.contacts(assigned_team_id);
CREATE INDEX idx_contacts_pipeline_stage ON public.contacts(pipeline_stage_id);
CREATE INDEX idx_contacts_email ON public.contacts(email);

-- Enable RLS
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contacts
CREATE POLICY "Users can view contacts in their org"
ON public.contacts
FOR SELECT
TO authenticated
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can create contacts in their org"
ON public.contacts
FOR INSERT
TO authenticated
WITH CHECK (
  org_id = get_user_org_id(auth.uid())
  AND created_by = auth.uid()
);

CREATE POLICY "Users can update contacts in their org"
ON public.contacts
FOR UPDATE
TO authenticated
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins and managers can delete contacts"
ON public.contacts
FOR DELETE
TO authenticated
USING (
  org_id = get_user_org_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'super_admin', 'sales_manager', 'support_manager')
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_contacts_updated_at
BEFORE UPDATE ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create activities/notes table for tracking interactions
CREATE TABLE IF NOT EXISTS public.contact_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  
  activity_type TEXT NOT NULL, -- call, email, meeting, note, task
  subject TEXT,
  description TEXT,
  
  -- Call specific
  call_disposition_id UUID REFERENCES public.call_dispositions(id) ON DELETE SET NULL,
  call_sub_disposition_id UUID REFERENCES public.call_sub_dispositions(id) ON DELETE SET NULL,
  call_duration INTEGER, -- in seconds
  
  -- Scheduling
  scheduled_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_activities_contact_id ON public.contact_activities(contact_id);
CREATE INDEX idx_activities_org_id ON public.contact_activities(org_id);
CREATE INDEX idx_activities_created_by ON public.contact_activities(created_by);

-- Enable RLS
ALTER TABLE public.contact_activities ENABLE ROW LEVEL SECURITY;

-- RLS Policies for activities
CREATE POLICY "Users can view activities in their org"
ON public.contact_activities
FOR SELECT
TO authenticated
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can create activities in their org"
ON public.contact_activities
FOR INSERT
TO authenticated
WITH CHECK (
  org_id = get_user_org_id(auth.uid())
  AND created_by = auth.uid()
);

CREATE POLICY "Users can update their own activities"
ON public.contact_activities
FOR UPDATE
TO authenticated
USING (
  org_id = get_user_org_id(auth.uid())
  AND created_by = auth.uid()
);

CREATE POLICY "Users can delete their own activities"
ON public.contact_activities
FOR DELETE
TO authenticated
USING (
  org_id = get_user_org_id(auth.uid())
  AND created_by = auth.uid()
);

-- Add trigger for updated_at
CREATE TRIGGER update_activities_updated_at
BEFORE UPDATE ON public.contact_activities
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();