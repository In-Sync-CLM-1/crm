import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, Loader2 } from "lucide-react";
import { useNotification } from "@/hooks/useNotification";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AIChatInterfaceProps {
  /** Title shown in the card header */
  title?: string;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Empty state message */
  emptyMessage?: string;
  /** Example prompt to show in empty state */
  examplePrompt?: string;
  /** Edge function name to call */
  functionName?: string;
  /** Whether to show as a Card wrapper or inline */
  showCard?: boolean;
  /** Custom class name */
  className?: string;
  /** Scroll area height */
  scrollHeight?: string;
}

export default function AIChatInterface({
  title = "AI Assistant",
  placeholder = "Ask a question...",
  emptyMessage = "Ask me anything about your data",
  examplePrompt = "What insights can you provide?",
  functionName = "chat-campaign-assistant",
  showCard = true,
  className,
  scrollHeight = "400px",
}: AIChatInterfaceProps) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const notify = useNotification();
  const { effectiveOrgId } = useOrgContext();

  const handleSend = async () => {
    if (!message.trim()) return;

    const userMessage = message;
    setMessage("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { query: userMessage, orgId: effectiveOrgId }
      });

      if (error) throw error;

      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.response || "I couldn't generate a response. Please try again."
      }]);
    } catch (error) {
      console.error('Chat error:', error);
      notify.error("Error", "Failed to get AI response");
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again."
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const chatContent = (
    <div className={className}>
      <ScrollArea className="w-full border rounded-lg p-4" style={{ height: scrollHeight }}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <Bot className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-sm">{emptyMessage}</p>
            <p className="text-xs mt-2">Try: "{examplePrompt}"</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg p-3 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Thinking...</span>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      <div className="flex gap-2 mt-4">
        <Textarea
          placeholder={placeholder}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={2}
          disabled={isLoading}
        />
        <Button onClick={handleSend} disabled={isLoading || !message.trim()} size="icon">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );

  if (!showCard) {
    return chatContent;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {chatContent}
      </CardContent>
    </Card>
  );
}

export { AIChatInterface };
