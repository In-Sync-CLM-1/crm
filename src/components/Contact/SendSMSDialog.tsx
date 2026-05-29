import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useNotification } from "@/hooks/useNotification";
import { Loader2, MessageSquare } from "lucide-react";
import { updateContactStageToContacted } from "@/utils/pipelineStageUtils";

interface SendSMSDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  contactName: string;
  phoneNumber: string;
}

const MAX_SMS_LENGTH = 160;
const MAX_LONG_SMS_LENGTH = 918; // 6 segments

export const SendSMSDialog = ({
  open,
  onOpenChange,
  contactId,
  contactName,
  phoneNumber,
}: SendSMSDialogProps) => {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const notify = useNotification();

  const messageLength = message.length;
  const segments = Math.ceil(messageLength / MAX_SMS_LENGTH) || 1;

  const handleSend = async () => {
    if (!message.trim()) {
      notify.error("Error", "Please enter a message");
      return;
    }

    if (messageLength > MAX_LONG_SMS_LENGTH) {
      notify.error("Error", "Message is too long. Maximum 918 characters allowed.");
      return;
    }

    setIsSending(true);

    try {
      const { data, error } = await supabase.functions.invoke("send-sms", {
        body: {
          contactId,
          phoneNumber,
          message: message.trim(),
        },
      });

      if (error) throw error;

      // Update pipeline stage from New to Contacted
      await updateContactStageToContacted(contactId);

      notify.success("SMS Sent", `SMS sent to ${contactName}`);

      setMessage("");
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error sending SMS:", error);
      notify.error("Failed to send SMS", error.message || "Please try again later");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Send SMS to {contactName}
          </DialogTitle>
          <DialogDescription>
            Sending to: {phoneNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              placeholder="Type your message here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={MAX_LONG_SMS_LENGTH}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {messageLength} / {MAX_LONG_SMS_LENGTH} characters
              </span>
              <span>
                {segments} SMS segment{segments > 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSending}
            >
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={isSending || !message.trim()}>
              {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send SMS
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
