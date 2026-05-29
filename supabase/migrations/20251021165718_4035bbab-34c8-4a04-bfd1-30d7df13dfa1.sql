-- Enable realtime for contact_activities table so journey logs update instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_activities;