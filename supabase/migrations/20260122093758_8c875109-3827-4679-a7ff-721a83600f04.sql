-- Create table to track GST payments to the department (monthly)
CREATE TABLE public.gst_payment_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2020 AND year <= 2100),
  gst_collected NUMERIC(15,2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'partial')),
  amount_paid NUMERIC(15,2) DEFAULT 0,
  payment_date DATE,
  payment_reference TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(org_id, month, year)
);

-- Enable RLS
ALTER TABLE public.gst_payment_tracking ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view GST payments in their org"
ON public.gst_payment_tracking
FOR SELECT
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert GST payments in their org"
ON public.gst_payment_tracking
FOR INSERT
WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update GST payments in their org"
ON public.gst_payment_tracking
FOR UPDATE
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete GST payments in their org"
ON public.gst_payment_tracking
FOR DELETE
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_gst_payment_tracking_updated_at
BEFORE UPDATE ON public.gst_payment_tracking
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();