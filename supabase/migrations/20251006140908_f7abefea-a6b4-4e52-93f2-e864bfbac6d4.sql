-- Create org_invites table
CREATE TABLE public.org_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code text NOT NULL UNIQUE,
  email text,
  role app_role NOT NULL DEFAULT 'sales_agent',
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  used_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;

-- Admins can manage invites in their org
CREATE POLICY "Admins can manage invites in their org"
ON public.org_invites
FOR ALL
USING (
  org_id = get_user_org_id(auth.uid()) AND
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))
);

-- Anyone can view valid unused invites (needed for signup)
CREATE POLICY "Anyone can view valid unused invites"
ON public.org_invites
FOR SELECT
USING (
  expires_at > now() AND
  used_at IS NULL
);

-- Create index for faster lookups
CREATE INDEX idx_org_invites_code ON public.org_invites(invite_code);
CREATE INDEX idx_org_invites_org_id ON public.org_invites(org_id);

-- Add trigger for updated_at
CREATE TRIGGER update_org_invites_updated_at
BEFORE UPDATE ON public.org_invites
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();