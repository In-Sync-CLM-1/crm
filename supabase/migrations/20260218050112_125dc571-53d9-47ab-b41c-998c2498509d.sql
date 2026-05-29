
-- Add attachments column to support_tickets
ALTER TABLE public.support_tickets ADD COLUMN attachments JSONB DEFAULT NULL;

-- Create ticket-attachments storage bucket (public)
INSERT INTO storage.buckets (id, name, public) VALUES ('ticket-attachments', 'ticket-attachments', true);

-- Allow anyone to upload ticket attachments
CREATE POLICY "Anyone can upload ticket attachments" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'ticket-attachments');

-- Allow anyone to view ticket attachments
CREATE POLICY "Anyone can view ticket attachments" ON storage.objects
  FOR SELECT USING (bucket_id = 'ticket-attachments');
