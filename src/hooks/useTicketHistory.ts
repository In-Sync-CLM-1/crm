import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TicketHistoryEntry {
  id: string;
  ticket_id: string;
  org_id: string;
  user_id: string | null;
  action: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  user?: { first_name: string; last_name: string } | null;
}

export function useTicketHistory(ticketId: string | null) {
  return useQuery({
    queryKey: ["ticket-history", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_ticket_history")
        .select("*, user:profiles!support_ticket_history_user_id_fkey(first_name, last_name)")
        .eq("ticket_id", ticketId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as TicketHistoryEntry[];
    },
    enabled: !!ticketId,
  });
}
