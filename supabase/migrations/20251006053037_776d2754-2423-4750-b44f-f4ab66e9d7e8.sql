-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create app_role enum for user roles
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'sales_manager', 'sales_agent', 'support_manager', 'support_agent', 'analyst');

-- Organizations table (multi-tenancy)
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#01B8AA',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  settings JSONB DEFAULT '{}'::jsonb,
  usage_limits JSONB DEFAULT '{"users": 50, "storage_gb": 10}'::jsonb
);

-- Profiles table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- User roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, org_id)
);

-- Teams table
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  manager_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Team members
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- Pipeline stages (Sales CRM)
CREATE TABLE public.pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  stage_order INTEGER NOT NULL,
  probability INTEGER DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),
  color TEXT DEFAULT '#01B8AA',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Call dispositions
CREATE TABLE public.call_dispositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT, -- 'positive', 'negative', 'neutral', 'follow_up'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Call sub-dispositions
CREATE TABLE public.call_sub_dispositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disposition_id UUID REFERENCES public.call_dispositions(id) ON DELETE CASCADE NOT NULL,
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_dispositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_sub_dispositions ENABLE ROW LEVEL SECURITY;

-- Security definer function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Security definer function to get user's org_id
CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id
  FROM public.profiles
  WHERE id = _user_id
  LIMIT 1
$$;

-- RLS Policies for organizations
CREATE POLICY "Users can view their own organization"
  ON public.organizations FOR SELECT
  USING (id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can update their organization"
  ON public.organizations FOR UPDATE
  USING (
    id = public.get_user_org_id(auth.uid()) AND 
    (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  );

-- RLS Policies for profiles
CREATE POLICY "Users can view profiles in their org"
  ON public.profiles FOR SELECT
  USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- RLS Policies for user_roles
CREATE POLICY "Users can view roles in their org"
  ON public.user_roles FOR SELECT
  USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage roles in their org"
  ON public.user_roles FOR ALL
  USING (
    org_id = public.get_user_org_id(auth.uid()) AND
    (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  );

-- RLS Policies for teams
CREATE POLICY "Users can view teams in their org"
  ON public.teams FOR SELECT
  USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Managers can manage teams in their org"
  ON public.teams FOR ALL
  USING (
    org_id = public.get_user_org_id(auth.uid()) AND
    (public.has_role(auth.uid(), 'super_admin') OR 
     public.has_role(auth.uid(), 'admin') OR 
     public.has_role(auth.uid(), 'sales_manager') OR 
     public.has_role(auth.uid(), 'support_manager'))
  );

-- RLS Policies for team_members
CREATE POLICY "Users can view team members in their org"
  ON public.team_members FOR SELECT
  USING (
    team_id IN (
      SELECT id FROM public.teams 
      WHERE org_id = public.get_user_org_id(auth.uid())
    )
  );

CREATE POLICY "Managers can manage team members"
  ON public.team_members FOR ALL
  USING (
    team_id IN (
      SELECT id FROM public.teams 
      WHERE org_id = public.get_user_org_id(auth.uid())
    ) AND
    (public.has_role(auth.uid(), 'super_admin') OR 
     public.has_role(auth.uid(), 'admin') OR 
     public.has_role(auth.uid(), 'sales_manager') OR 
     public.has_role(auth.uid(), 'support_manager'))
  );

-- RLS Policies for pipeline_stages
CREATE POLICY "Users can view pipeline stages in their org"
  ON public.pipeline_stages FOR SELECT
  USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage pipeline stages"
  ON public.pipeline_stages FOR ALL
  USING (
    org_id = public.get_user_org_id(auth.uid()) AND
    (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  );

-- RLS Policies for call_dispositions
CREATE POLICY "Users can view dispositions in their org"
  ON public.call_dispositions FOR SELECT
  USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage dispositions"
  ON public.call_dispositions FOR ALL
  USING (
    org_id = public.get_user_org_id(auth.uid()) AND
    (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  );

-- RLS Policies for call_sub_dispositions
CREATE POLICY "Users can view sub-dispositions in their org"
  ON public.call_sub_dispositions FOR SELECT
  USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage sub-dispositions"
  ON public.call_sub_dispositions FOR ALL
  USING (
    org_id = public.get_user_org_id(auth.uid()) AND
    (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  );

-- Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pipeline_stages_updated_at BEFORE UPDATE ON public.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_call_dispositions_updated_at BEFORE UPDATE ON public.call_dispositions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_call_sub_dispositions_updated_at BEFORE UPDATE ON public.call_sub_dispositions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to create default pipeline stages for new organization
CREATE OR REPLACE FUNCTION public.create_default_pipeline_stages(_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.pipeline_stages (org_id, name, description, stage_order, probability, color) VALUES
    (_org_id, 'New', 'Newly created leads', 1, 10, '#8AD4EB'),
    (_org_id, 'Contacted', 'Initial contact made', 2, 25, '#01B8AA'),
    (_org_id, 'Qualified', 'Lead qualified', 3, 50, '#F2C80F'),
    (_org_id, 'Proposal', 'Proposal sent', 4, 70, '#A66999'),
    (_org_id, 'Negotiation', 'In negotiation', 5, 85, '#FE9666'),
    (_org_id, 'Won', 'Deal won', 6, 100, '#168980'),
    (_org_id, 'Lost', 'Deal lost', 7, 0, '#FD625E');
END;
$$;

-- Function to create default call dispositions for new organization
CREATE OR REPLACE FUNCTION public.create_default_call_dispositions(_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _interested_id UUID;
  _not_interested_id UUID;
  _callback_id UUID;
  _no_answer_id UUID;
BEGIN
  -- Insert main dispositions and capture IDs
  INSERT INTO public.call_dispositions (org_id, name, description, category) VALUES
    (_org_id, 'Interested', 'Customer showed interest', 'positive', 'positive')
    RETURNING id INTO _interested_id;
  
  INSERT INTO public.call_dispositions (org_id, name, description, category) VALUES
    (_org_id, 'Not Interested', 'Customer not interested', 'negative', 'negative')
    RETURNING id INTO _not_interested_id;
  
  INSERT INTO public.call_dispositions (org_id, name, description, category) VALUES
    (_org_id, 'Callback Requested', 'Customer requested callback', 'follow_up', 'follow_up')
    RETURNING id INTO _callback_id;
  
  INSERT INTO public.call_dispositions (org_id, name, description, category) VALUES
    (_org_id, 'No Answer', 'No one answered the call', 'neutral', 'neutral')
    RETURNING id INTO _no_answer_id;
  
  INSERT INTO public.call_dispositions (org_id, name, description, category) VALUES
    (_org_id, 'Wrong Number', 'Incorrect contact number', 'neutral', 'neutral'),
    (_org_id, 'Voicemail', 'Left voicemail message', 'neutral', 'neutral'),
    (_org_id, 'Do Not Call', 'Customer requested no more calls', 'negative', 'negative');

  -- Insert sub-dispositions
  INSERT INTO public.call_sub_dispositions (disposition_id, org_id, name, description) VALUES
    (_interested_id, _org_id, 'Ready to Buy', 'Customer ready to purchase'),
    (_interested_id, _org_id, 'Needs More Info', 'Interested but needs details'),
    (_interested_id, _org_id, 'Budget Approval', 'Needs budget approval'),
    (_not_interested_id, _org_id, 'Too Expensive', 'Price is too high'),
    (_not_interested_id, _org_id, 'No Need', 'Doesn''t need the product'),
    (_not_interested_id, _org_id, 'Using Competitor', 'Already using competitor'),
    (_callback_id, _org_id, 'Specific Time', 'Call at specific time'),
    (_callback_id, _org_id, 'After Decision', 'Call after internal decision'),
    (_no_answer_id, _org_id, 'Busy', 'Line was busy'),
    (_no_answer_id, _org_id, 'No Pickup', 'Phone rang but no pickup');
END;
$$;

-- Trigger to auto-create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();