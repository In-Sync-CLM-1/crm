-- Create trigger to fire outbound webhooks when a new contact is created
CREATE TRIGGER trigger_contact_created_webhook
AFTER INSERT ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION trigger_outbound_webhook('contact_created');