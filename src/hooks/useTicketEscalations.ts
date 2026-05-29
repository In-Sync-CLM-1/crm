import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Escalation {
  id: string;
  ticket_id: string;
  org_id: string;
  escalated_by: string;
  escalated_to: string;
  remarks: string;
  attachments: { name: string; url: string; size: number }[];
  created_at: string;
  escalated_by_profile?: { first_name: string; last_name: string } | null;
  escalated_to_profile?: { first_name: string; last_name: string } | null;
}

export function useTicketEscalations(ticketId: string | null) {
  const queryClient = useQueryClient();

  const escalationsQuery = useQuery({
    queryKey: ["ticket-escalations", ticketId],
    enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_ticket_escalations")
        .select("*")
        .eq("ticket_id", ticketId!)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch profile names for escalated_by and escalated_to
      const userIds = new Set<string>();
      data.forEach((e: any) => {
        userIds.add(e.escalated_by);
        userIds.add(e.escalated_to);
      });

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", Array.from(userIds));

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      return data.map((e: any) => ({
        ...e,
        attachments: (e.attachments as any) || [],
        escalated_by_profile: profileMap.get(e.escalated_by) || null,
        escalated_to_profile: profileMap.get(e.escalated_to) || null,
      })) as Escalation[];
    },
  });

  const createEscalation = useMutation({
    mutationFn: async ({
      ticketId,
      orgId,
      escalatedTo,
      remarks,
      files,
    }: {
      ticketId: string;
      orgId: string;
      escalatedTo: string;
      remarks: string;
      files: File[];
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Upload files
      const attachments: { name: string; url: string; size: number }[] = [];
      for (const file of files) {
        const filePath = `${orgId}/${ticketId}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("ticket-escalation-attachments")
          .upload(filePath, file);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("ticket-escalation-attachments")
          .getPublicUrl(filePath);

        attachments.push({ name: file.name, url: urlData.publicUrl, size: file.size });
      }

      // Insert escalation record
      const { error: insertError } = await supabase
        .from("support_ticket_escalations")
        .insert({
          ticket_id: ticketId,
          org_id: orgId,
          escalated_by: user.id,
          escalated_to: escalatedTo,
          remarks,
          attachments,
        });
      if (insertError) throw insertError;

      // Update ticket assigned_to and status
      const { error: updateError } = await supabase
        .from("support_tickets")
        .update({ assigned_to: escalatedTo, status: "assigned" })
        .eq("id", ticketId);
      if (updateError) throw updateError;

      // Log in history
      const { error: historyError } = await supabase
        .from("support_ticket_history")
        .insert({
          ticket_id: ticketId,
          org_id: orgId,
          user_id: user.id,
          action: "escalated",
          new_value: `Escalated to senior with remarks: ${remarks.substring(0, 100)}`,
        });
      if (historyError) console.error("History log error:", historyError);
    },
    onSuccess: () => {
      toast.success("Ticket escalated successfully");
      queryClient.invalidateQueries({ queryKey: ["ticket-escalations", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-history", ticketId] });
    },
    onError: (err: Error) => {
      toast.error("Failed to escalate: " + err.message);
    },
  });

  return { escalationsQuery, createEscalation };
}
