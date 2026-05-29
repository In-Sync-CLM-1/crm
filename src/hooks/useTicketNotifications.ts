import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TicketNotification {
  id: string;
  ticket_id: string;
  channel: string;
  recipient: string;
  subject: string | null;
  message_preview: string | null;
  status: string;
  error_message: string | null;
  sent_at: string;
}

export function useTicketNotifications(ticketId: string | null) {
  return useQuery({
    queryKey: ["ticket-notifications", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_ticket_notifications")
        .select("id, ticket_id, channel, recipient, subject, message_preview, status, error_message, sent_at")
        .eq("ticket_id", ticketId!)
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return data as unknown as TicketNotification[];
    },
    enabled: !!ticketId,
  });
}
