-- Create error logs table
CREATE TABLE public.error_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  user_id UUID,
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_details JSONB,
  page_url TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add index for faster queries
CREATE INDEX idx_error_logs_org_id ON public.error_logs(org_id);
CREATE INDEX idx_error_logs_created_at ON public.error_logs(created_at DESC);
CREATE INDEX idx_error_logs_error_type ON public.error_logs(error_type);

-- Enable RLS
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Platform admins can view all error logs
CREATE POLICY "Platform admins can view all error logs"
ON public.error_logs
FOR SELECT
USING (is_platform_admin(auth.uid()));

-- Users can insert error logs for their org
CREATE POLICY "Users can insert error logs for their org"
ON public.error_logs
FOR INSERT
WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- Admins can view error logs in their org
CREATE POLICY "Admins can view error logs in their org"
ON public.error_logs
FOR SELECT
USING (
  org_id = get_user_org_id(auth.uid()) AND
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
);