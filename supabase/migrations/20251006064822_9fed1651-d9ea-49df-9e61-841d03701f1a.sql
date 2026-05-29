-- Create contact_emails table for multiple email addresses
CREATE TABLE public.contact_emails (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  email text NOT NULL,
  email_type text NOT NULL DEFAULT 'work', -- work, personal, other
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create contact_phones table for multiple phone numbers
CREATE TABLE public.contact_phones (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  phone text NOT NULL,
  phone_type text NOT NULL DEFAULT 'mobile', -- mobile, work, home, fax, other
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contact_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_phones ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contact_emails
CREATE POLICY "Users can view emails in their org"
  ON public.contact_emails
  FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can insert emails in their org"
  ON public.contact_emails
  FOR INSERT
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can update emails in their org"
  ON public.contact_emails
  FOR UPDATE
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can delete emails in their org"
  ON public.contact_emails
  FOR DELETE
  USING (org_id = get_user_org_id(auth.uid()));

-- RLS Policies for contact_phones
CREATE POLICY "Users can view phones in their org"
  ON public.contact_phones
  FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can insert phones in their org"
  ON public.contact_phones
  FOR INSERT
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can update phones in their org"
  ON public.contact_phones
  FOR UPDATE
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can delete phones in their org"
  ON public.contact_phones
  FOR DELETE
  USING (org_id = get_user_org_id(auth.uid()));

-- Add triggers for updated_at
CREATE TRIGGER update_contact_emails_updated_at
  BEFORE UPDATE ON public.contact_emails
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contact_phones_updated_at
  BEFORE UPDATE ON public.contact_phones
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_contact_emails_contact_id ON public.contact_emails(contact_id);
CREATE INDEX idx_contact_emails_org_id ON public.contact_emails(org_id);
CREATE INDEX idx_contact_phones_contact_id ON public.contact_phones(contact_id);
CREATE INDEX idx_contact_phones_org_id ON public.contact_phones(org_id);