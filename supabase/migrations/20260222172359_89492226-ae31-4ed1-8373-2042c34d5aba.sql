
-- Create webhook triggers for support_tickets table
CREATE TRIGGER webhook_support_tickets_INSERT
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

CREATE TRIGGER webhook_support_tickets_UPDATE
  AFTER UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

CREATE TRIGGER webhook_support_tickets_DELETE
  AFTER DELETE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

-- Create webhook triggers for support_ticket_comments table
CREATE TRIGGER webhook_support_ticket_comments_INSERT
  AFTER INSERT ON public.support_ticket_comments
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

CREATE TRIGGER webhook_support_ticket_comments_UPDATE
  AFTER UPDATE ON public.support_ticket_comments
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

-- Create webhook triggers for support_ticket_history table
CREATE TRIGGER webhook_support_ticket_history_INSERT
  AFTER INSERT ON public.support_ticket_history
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();

-- Create webhook triggers for support_ticket_escalations table
CREATE TRIGGER webhook_support_ticket_escalations_INSERT
  AFTER INSERT ON public.support_ticket_escalations
  FOR EACH ROW EXECUTE FUNCTION trigger_outbound_webhook_generic();
