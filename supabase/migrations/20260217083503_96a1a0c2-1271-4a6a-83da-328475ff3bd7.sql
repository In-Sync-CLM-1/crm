
ALTER TABLE public.support_tickets
ADD COLUMN client_notified boolean NOT NULL DEFAULT false,
ADD COLUMN client_notified_at timestamp with time zone;
