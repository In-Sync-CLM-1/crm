-- Create clients table (converted from contacts when deal is won)
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  converted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  converted_by UUID REFERENCES public.profiles(id),
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  company TEXT,
  job_title TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  postal_code TEXT,
  notes TEXT,
  last_discussion TEXT,
  last_discussion_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, contact_id)
);

-- Create client_documents table
CREATE TABLE public.client_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_name TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'other',
  file_url TEXT,
  external_link TEXT,
  description TEXT,
  uploaded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create client_invoices table
CREATE TABLE public.client_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'draft',
  file_url TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_invoices ENABLE ROW LEVEL SECURITY;

-- RLS policies for clients
CREATE POLICY "Users can view clients in their org" ON public.clients
  FOR SELECT USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can create clients in their org" ON public.clients
  FOR INSERT WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can update clients in their org" ON public.clients
  FOR UPDATE USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can delete clients" ON public.clients
  FOR DELETE USING (
    org_id = get_user_org_id(auth.uid()) AND 
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  );

-- RLS policies for client_documents
CREATE POLICY "Users can view documents in their org" ON public.client_documents
  FOR SELECT USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can create documents in their org" ON public.client_documents
  FOR INSERT WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can update documents in their org" ON public.client_documents
  FOR UPDATE USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can delete documents in their org" ON public.client_documents
  FOR DELETE USING (org_id = get_user_org_id(auth.uid()));

-- RLS policies for client_invoices
CREATE POLICY "Users can view invoices in their org" ON public.client_invoices
  FOR SELECT USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can create invoices in their org" ON public.client_invoices
  FOR INSERT WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can update invoices in their org" ON public.client_invoices
  FOR UPDATE USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can delete invoices in their org" ON public.client_invoices
  FOR DELETE USING (org_id = get_user_org_id(auth.uid()));

-- Create storage bucket for client documents
INSERT INTO storage.buckets (id, name, public) VALUES ('client-documents', 'client-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can upload client documents" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'client-documents' AND 
    auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can view client documents in their org" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'client-documents' AND 
    auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can delete their uploaded documents" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'client-documents' AND 
    auth.uid() IS NOT NULL
  );

-- Create indexes for performance
CREATE INDEX idx_clients_org_id ON public.clients(org_id);
CREATE INDEX idx_clients_contact_id ON public.clients(contact_id);
CREATE INDEX idx_client_documents_client_id ON public.client_documents(client_id);
CREATE INDEX idx_client_invoices_client_id ON public.client_invoices(client_id);

-- Update timestamps trigger
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_documents_updated_at
  BEFORE UPDATE ON public.client_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_invoices_updated_at
  BEFORE UPDATE ON public.client_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();