import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageSquare, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SMSMessage {
  id: string;
  phone_number: string;
  message_content: string;
  direction: string;
  status: string;
  sent_at: string;
  delivered_at: string | null;
  error_message: string | null;
  exotel_sms_id: string | null;
  sent_by_profile: {
    first_name: string;
    last_name: string;
  } | null;
}

interface SMSHistoryProps {
  contactId: string;
}

export const SMSHistory = ({ contactId }: SMSHistoryProps) => {
  const { data: messages, isLoading } = useQuery({
    queryKey: ["sms-history", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sms_messages")
        .select(`
          id,
          phone_number,
          message_content,
          direction,
          status,
          sent_at,
          delivered_at,
          error_message,
          exotel_sms_id,
          sent_by_profile:profiles!sms_messages_sent_by_fkey(first_name, last_name)
        `)
        .eq("contact_id", contactId)
        .order("sent_at", { ascending: false });

      if (error) throw error;
      return data as SMSMessage[];
    },
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      sent: "secondary",
      delivered: "default",
      failed: "destructive",
      pending: "outline",
      received: "default",
    };

    return (
      <Badge variant={variants[status] || "secondary"} className="text-xs">
        {status}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!messages?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">No SMS messages yet</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-3 pr-4">
        {messages.map((message) => (
          <Card
            key={message.id}
            className={`p-4 ${
              message.direction === "outbound"
                ? "ml-8 bg-primary/5 border-primary/20"
                : "mr-8 bg-muted"
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                {message.direction === "outbound" ? (
                  <ArrowUpRight className="h-4 w-4 text-primary" />
                ) : (
                  <ArrowDownLeft className="h-4 w-4 text-green-600" />
                )}
                <span className="text-xs text-muted-foreground">
                  {message.direction === "outbound"
                    ? message.sent_by_profile
                      ? `${message.sent_by_profile.first_name} ${message.sent_by_profile.last_name}`
                      : "System"
                    : message.phone_number}
                </span>
              </div>
              {getStatusBadge(message.status)}
            </div>

            <p className="text-sm whitespace-pre-wrap">{message.message_content}</p>

            {message.error_message && (
              <p className="text-xs text-destructive mt-2">
                Error: {message.error_message}
              </p>
            )}

            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-3">
              {message.exotel_sms_id && (
                <span>ID: {message.exotel_sms_id}</span>
              )}
              <span>Sent: {format(new Date(message.sent_at), "PPp")}</span>
              {message.delivered_at && (
                <span>Delivered: {format(new Date(message.delivered_at), "PPp")}</span>
              )}
            </div>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
};
