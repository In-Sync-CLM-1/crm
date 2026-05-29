-- Drop the old foreign key pointing to auth.users
ALTER TABLE public.call_logs 
DROP CONSTRAINT call_logs_agent_id_fkey;

-- Add new foreign key pointing to profiles table
ALTER TABLE public.call_logs 
ADD CONSTRAINT call_logs_agent_id_fkey 
FOREIGN KEY (agent_id) 
REFERENCES public.profiles(id) 
ON DELETE SET NULL;