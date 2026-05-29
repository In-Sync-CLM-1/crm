import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageSquare, Send, CheckCircle2, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";

interface WhatsAppMessage {
  id: string;
  message_content: string;
  status: string;
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  error_message: string | null;
  exotel_message_id: string | null;
  exotel_status_code: string | null;
  sent_by_profile: {
    first_name: string;
    last_name: string;
  } | null;
}

interface WhatsAppHistoryProps {
  contactId: string;
}

export function WhatsAppHistory({ contactId }: WhatsAppHistoryProps) {
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);

  useEffect(() => {
    fetchMessages();
  }, [contactId]);

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select(`
          *,
          sent_by_profile:profiles!sent_by (first_name, last_name)
        `)
        .eq("contact_id", contactId)
        .order("sent_at", { ascending: false });

      if (error) throw error;
      setMessages((data || []) as unknown as WhatsAppMessage[]);
    } catch (error) {
      console.error("Error fetching WhatsApp messages:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case "sent":
        return <Send className="h-4 w-4 text-blue-500" />;
      case "delivered":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "read":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <MessageSquare className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="text-center py-8">
        <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No WhatsApp messages sent yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <Card key={message.id}>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="mt-1">{getStatusIcon(message.status)}</div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {message.status}
                    </Badge>
                    {message.sent_by_profile && (
                      <span className="text-xs text-muted-foreground">
                        by {message.sent_by_profile.first_name} {message.sent_by_profile.last_name}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(message.sent_at), "PPp")}
                  </span>
                </div>
                
                <p className="text-sm bg-muted p-3 rounded-md">{message.message_content}</p>
                
                {message.error_message && (
                  <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                    Error: {message.error_message}
                  </p>
                )}
                
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  {message.exotel_message_id && (
                    <span>ID: {message.exotel_message_id}</span>
                  )}
                  {message.delivered_at && (
                    <span>Delivered: {format(new Date(message.delivered_at), "PPp")}</span>
                  )}
                  {message.read_at && (
                    <span>Read: {format(new Date(message.read_at), "PPp")}</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}