-- Create invoice_imports table to track bulk import sessions
CREATE TABLE public.invoice_imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id),
  total_files INTEGER NOT NULL DEFAULT 0,
  processed_files INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'review', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create invoice_import_items table for individual invoice extraction results
CREATE TABLE public.invoice_import_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES public.invoice_imports(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT,
  extracted_data JSONB,
  client_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  client_company TEXT,
  client_address TEXT,
  invoice_number TEXT,
  invoice_date DATE,
  due_date DATE,
  amount NUMERIC(12, 2),
  tax_amount NUMERIC(12, 2),
  currency TEXT DEFAULT 'INR',
  duplicate_status TEXT NOT NULL DEFAULT 'none' CHECK (duplicate_status IN ('none', 'exact_match', 'potential_match')),
  matched_client_id UUID REFERENCES public.clients(id),
  matched_contact_id UUID REFERENCES public.contacts(id),
  potential_matches JSONB,
  action TEXT DEFAULT 'pending' CHECK (action IN ('pending', 'create_client', 'create_lead', 'link_existing', 'skip')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'extracting', 'extracted', 'reviewed', 'processed', 'failed')),
  error_message TEXT,
  created_client_id UUID REFERENCES public.clients(id),
  created_contact_id UUID REFERENCES public.contacts(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.invoice_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_import_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for invoice_imports
CREATE POLICY "Users can view their org invoice imports" 
ON public.invoice_imports 
FOR SELECT 
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create invoice imports for their org" 
ON public.invoice_imports 
FOR INSERT 
WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update their org invoice imports" 
ON public.invoice_imports 
FOR UPDATE 
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete their org invoice imports" 
ON public.invoice_imports 
FOR DELETE 
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- RLS policies for invoice_import_items
CREATE POLICY "Users can view their org invoice import items" 
ON public.invoice_import_items 
FOR SELECT 
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create invoice import items for their org" 
ON public.invoice_import_items 
FOR INSERT 
WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update their org invoice import items" 
ON public.invoice_import_items 
FOR UPDATE 
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete their org invoice import items" 
ON public.invoice_import_items 
FOR DELETE 
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- Create indexes for better performance
CREATE INDEX idx_invoice_imports_org_id ON public.invoice_imports(org_id);
CREATE INDEX idx_invoice_imports_status ON public.invoice_imports(status);
CREATE INDEX idx_invoice_import_items_import_id ON public.invoice_import_items(import_id);
CREATE INDEX idx_invoice_import_items_org_id ON public.invoice_import_items(org_id);
CREATE INDEX idx_invoice_import_items_status ON public.invoice_import_items(status);
CREATE INDEX idx_invoice_import_items_duplicate_status ON public.invoice_import_items(duplicate_status);

-- Create trigger for automatic timestamp updates on invoice_import_items
CREATE TRIGGER update_invoice_import_items_updated_at
BEFORE UPDATE ON public.invoice_import_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();