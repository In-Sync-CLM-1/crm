-- Create table to track user module usage
CREATE TABLE public.user_module_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid NOT NULL,
  module_key text NOT NULL,
  module_name text NOT NULL,
  module_path text NOT NULL,
  module_icon text NOT NULL,
  visit_count integer NOT NULL DEFAULT 1,
  last_visited_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, module_key)
);

-- Enable RLS
ALTER TABLE public.user_module_usage ENABLE ROW LEVEL SECURITY;

-- Users can view their own usage data
CREATE POLICY "Users can view their own usage"
ON public.user_module_usage
FOR SELECT
USING (user_id = auth.uid());

-- Users can insert their own usage data
CREATE POLICY "Users can insert their own usage"
ON public.user_module_usage
FOR INSERT
WITH CHECK (user_id = auth.uid() AND org_id = get_user_org_id(auth.uid()));

-- Users can update their own usage data
CREATE POLICY "Users can update their own usage"
ON public.user_module_usage
FOR UPDATE
USING (user_id = auth.uid());

-- Create index for faster queries
CREATE INDEX idx_user_module_usage_user_id ON public.user_module_usage(user_id);
CREATE INDEX idx_user_module_usage_visit_count ON public.user_module_usage(user_id, visit_count DESC);