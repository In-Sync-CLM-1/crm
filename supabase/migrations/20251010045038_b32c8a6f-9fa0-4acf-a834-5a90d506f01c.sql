-- Create storage bucket for WhatsApp template media
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-templates', 'whatsapp-templates', true)
ON CONFLICT (id) DO NOTHING;