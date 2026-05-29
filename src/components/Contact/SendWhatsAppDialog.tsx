import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useNotification } from "@/hooks/useNotification";
import { Loader2 } from "lucide-react";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { format } from "date-fns";
import { updateContactStageToContacted } from "@/utils/pipelineStageUtils";

interface Template {
  id: string;
  template_name: string;
  content: string;
  variables: Array<{ index: number; name: string }> | null;
}

interface SendWhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  contactName: string;
  phoneNumber: string;
  onMessageSent?: () => void;
}

export function SendWhatsAppDialog({
  open,
  onOpenChange,
  contactId,
  contactName,
  phoneNumber,
  onMessageSent,
}: SendWhatsAppDialogProps) {
  const { effectiveOrgId } = useOrgContext();
  const notify = useNotification();
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});
  const [customMessage, setCustomMessage] = useState("");
  const [messageType, setMessageType] = useState<"template" | "custom">("template");
  
  // Scheduling
  const [sendImmediately, setSendImmediately] = useState(true);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);

  useEffect(() => {
    if (open && effectiveOrgId) {
      fetchTemplates();
    }
  }, [open, effectiveOrgId]);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("communication_templates")
        .select("id, template_name, content, variables")
        .eq("org_id", effectiveOrgId)
        .eq("template_type", "whatsapp")
        .eq("status", "approved")
        .order("template_name");

      if (error) throw error;
      setTemplates((data || []) as Template[]);
    } catch (error: any) {
      console.error("Error fetching templates:", error);
      notify.error("Error", new Error("Failed to load templates"));
    }
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (template?.variables) {
      const vars: Record<string, string> = {};
      template.variables.forEach((v: any) => {
        vars[v.index] = "";
      });
      setTemplateVariables(vars);
    }
  };

  const handleSend = async () => {
    if (messageType === "template" && !selectedTemplateId) {
      notify.error("Validation Error", new Error("Please select a template"));
      return;
    }

    if (messageType === "custom" && !customMessage.trim()) {
      notify.error("Validation Error", new Error("Please enter a message"));
      return;
    }

    if (!sendImmediately && !scheduledAt) {
      notify.error("Validation Error", new Error("Please select a scheduled date and time"));
      return;
    }

    setSending(true);
    try {
      if (sendImmediately) {
        // Send immediately via edge function
        const payload: any = {
          contactId,
          phoneNumber: phoneNumber.replace(/[^\d]/g, ""),
        };

        if (messageType === "template") {
          payload.templateId = selectedTemplateId;
          payload.templateVariables = templateVariables;
        } else {
          payload.message = customMessage;
        }

        const { error } = await supabase.functions.invoke("send-whatsapp-message", {
          body: payload,
        });

        if (error) throw error;

        // Update pipeline stage from New to Contacted
        await updateContactStageToContacted(contactId);

        notify.success("Success", "WhatsApp message sent successfully");
      } else {
        // Create scheduled message record
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("User not authenticated");

        const messageContent = messageType === "custom" 
          ? customMessage 
          : templates.find(t => t.id === selectedTemplateId)?.content || "";

        const { error } = await supabase
          .from("whatsapp_messages")
          .insert([{
            org_id: effectiveOrgId,
            contact_id: contactId,
            phone_number: phoneNumber.replace(/[^\d]/g, ""),
            message_content: messageContent,
            template_id: messageType === "template" ? selectedTemplateId : null,
            sent_by: user.id,
            status: "scheduled",
            scheduled_at: scheduledAt?.toISOString(),
          }]);

        if (error) throw error;

        notify.success("Message scheduled", `Message will be sent on ${format(scheduledAt, "PPP 'at' p")}`);
      }

      onOpenChange(false);
      onMessageSent?.();
    } catch (error: any) {
      console.error("Error sending message:", error);
      notify.error("Error", error);
    } finally {
      setSending(false);
    }
  };

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Send WhatsApp Message</DialogTitle>
          <DialogDescription>
            Send a WhatsApp message to {contactName} ({phoneNumber})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Message Type</Label>
            <Select
              value={messageType}
              onValueChange={(value: "template" | "custom") => setMessageType(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="template">Use Template</SelectItem>
                <SelectItem value="custom">Custom Message</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {messageType === "template" ? (
            <>
              <div className="space-y-2">
                <Label>Select Template</Label>
                <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.template_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTemplate && (
                <>
                  <div className="p-3 bg-muted rounded-md text-sm">
                    <Label className="text-xs text-muted-foreground">Preview:</Label>
                    <p className="mt-1">{selectedTemplate.content}</p>
                  </div>

                  {selectedTemplate.variables && selectedTemplate.variables.length > 0 && (
                    <div className="space-y-3">
                      <Label>Template Variables</Label>
                      {selectedTemplate.variables.map((variable: any) => (
                        <div key={variable.index} className="space-y-2">
                          <Label htmlFor={`var-${variable.index}`}>
                            Variable {variable.index}
                          </Label>
                          <Input
                            id={`var-${variable.index}`}
                            value={templateVariables[variable.index] || ""}
                            onChange={(e) =>
                              setTemplateVariables({
                                ...templateVariables,
                                [variable.index]: e.target.value,
                              })
                            }
                            placeholder={`Enter value for {{${variable.index}}}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="custom-message">Message</Label>
              <Textarea
                id="custom-message"
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Type your message here..."
                rows={5}
              />
              <p className="text-xs text-muted-foreground">
                Note: Session messages can only be sent within 24 hours of the last customer interaction
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              "Send Message"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}