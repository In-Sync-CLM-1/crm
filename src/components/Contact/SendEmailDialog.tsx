import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useNotification } from "@/hooks/useNotification";
import { useOrgContext } from "@/hooks/useOrgContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { format } from "date-fns";
import { updateContactStageToContacted } from "@/utils/pipelineStageUtils";

interface SendEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  contactName: string;
  onEmailSent?: () => void;
}

export function SendEmailDialog({
  open,
  onOpenChange,
  contactId,
  contactName,
  onEmailSent,
}: SendEmailDialogProps) {
  const notify = useNotification();
  const { effectiveOrgId } = useOrgContext();
  const [loading, setLoading] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [userInfo, setUserInfo] = useState<{ firstName: string; lastName: string; email: string } | null>(null);
  
  // Scheduling
  const [sendImmediately, setSendImmediately] = useState(true);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);

  useEffect(() => {
    if (open) {
      fetchPrimaryEmail();
      fetchUserInfo();
    }
  }, [open, contactId]);

  const fetchUserInfo = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", user.id)
        .single();

      if (profile) {
        setUserInfo({
          firstName: profile.first_name || "",
          lastName: profile.last_name || "",
          email: user.email || "",
        });
      }
    } catch (error) {
      console.error("Error fetching user info:", error);
    }
  };

  const fetchPrimaryEmail = async () => {
    try {
      const { data, error } = await supabase
        .from("contact_emails")
        .select("email")
        .eq("contact_id", contactId)
        .eq("is_primary", true)
        .maybeSingle();

      if (error) throw error;
      
      if (data?.email) {
        setRecipientEmail(data.email);
      } else {
        // Fallback to legacy email field
        const { data: contact } = await supabase
          .from("contacts")
          .select("email")
          .eq("id", contactId)
          .single();
        
        if (contact?.email) {
          setRecipientEmail(contact.email);
        }
      }
    } catch (error: any) {
      console.error("Error fetching email:", error);
    }
  };

  const handleSend = async () => {
    if (!recipientEmail || !subject || !body) {
      notify.error("Missing fields", new Error("Please fill in all fields before sending."));
      return;
    }

    if (!sendImmediately && !scheduledAt) {
      notify.error("Missing schedule", new Error("Please select a scheduled date and time."));
      return;
    }

    setLoading(true);

    try {
      if (sendImmediately) {
        // Send immediately via edge function
        const { data, error } = await supabase.functions.invoke("send-email", {
          body: {
            to: recipientEmail,
            subject: subject,
            htmlContent: body.replace(/\n/g, '<br>'),
            contactId: contactId,
          },
        });

        if (error) throw error;

        // Update pipeline stage from New to Contacted
        await updateContactStageToContacted(contactId);

        notify.success("Email sent", `Email sent successfully to ${contactName}`);
      } else {
        // Create scheduled email record
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("User not authenticated");

        const { data: profile } = await supabase
          .from("profiles")
          .select("org_id")
          .eq("id", user.id)
          .single();

        if (!profile) throw new Error("Profile not found");

        const conversationId = crypto.randomUUID();
        
        const { error } = await supabase
          .from("email_conversations")
          .insert([{
            org_id: profile.org_id,
            conversation_id: conversationId,
            contact_id: contactId,
            from_email: userInfo?.email || user.email || "",
            from_name: `${userInfo?.firstName} ${userInfo?.lastName}`,
            to_email: recipientEmail,
            subject: subject,
            email_content: body.replace(/\n/g, '<br>'),
            html_content: body.replace(/\n/g, '<br>'),
            direction: "outbound",
            status: "scheduled",
            scheduled_at: scheduledAt?.toISOString(),
            sent_by: user.id,
          }]);

        if (error) throw error;

        notify.success("Email scheduled", `Email will be sent on ${format(scheduledAt, "PPP 'at' p")}`);

      }

      // Reset form
      setSubject("");
      setBody("");
      setSendImmediately(true);
      setScheduledAt(null);
      
      onEmailSent?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error sending email:", error);
      notify.error("Failed to send email", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Send Email to {contactName}</DialogTitle>
          <DialogDescription>
            Compose and send an email message
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="recipient@example.com"
              type="email"
            />
            {userInfo && (
              <p className="text-sm text-muted-foreground">
                Sending as: {userInfo.firstName} {userInfo.lastName} (replies will go to {userInfo.email})
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Message</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type your message here..."
              rows={8}
            />
          </div>

          <div className="space-y-4 border-t pt-4">
            <Label>Sending Schedule</Label>
            <RadioGroup value={sendImmediately ? "now" : "scheduled"} onValueChange={(v) => setSendImmediately(v === "now")}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="now" id="send-email-now" />
                <Label htmlFor="send-email-now" className="cursor-pointer font-normal">Send immediately</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="scheduled" id="send-email-scheduled" />
                <Label htmlFor="send-email-scheduled" className="cursor-pointer font-normal">Schedule for later</Label>
              </div>
            </RadioGroup>
            
            {!sendImmediately && (
              <DateTimePicker
                value={scheduledAt}
                onChange={setScheduledAt}
                minDate={new Date()}
                label="Select date and time"
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {sendImmediately ? 'Send Email' : 'Schedule Email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}