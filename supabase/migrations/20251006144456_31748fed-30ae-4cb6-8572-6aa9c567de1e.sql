-- Add foreign key constraints to error_logs table
ALTER TABLE public.error_logs
ADD CONSTRAINT error_logs_org_id_fkey
FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.error_logs
ADD CONSTRAINT error_logs_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;