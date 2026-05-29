
-- Drop and recreate the escalations trigger to ensure it's correct
DROP TRIGGER IF EXISTS webhook_support_ticket_escalations_insert ON public.support_ticket_escalations;
CREATE TRIGGER webhook_support_ticket_escalations_insert
  AFTER INSERT ON public.support_ticket_escalations
  FOR EACH ROW
  EXECUTE FUNCTION trigger_outbound_webhook_generic();

-- Drop stale triggers from old misconfigured webhooks
DROP TRIGGER IF EXISTS webhook_support_ticket_comments_update ON public.support_ticket_comments;
DROP TRIGGER IF EXISTS webhook_support_ticket_history_update ON public.support_ticket_history;
