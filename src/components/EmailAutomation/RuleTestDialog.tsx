import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useNotification } from "@/hooks/useNotification";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Eye } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface RuleTestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: any;
}

export function RuleTestDialog({ open, onOpenChange, rule }: RuleTestDialogProps) {
  const { effectiveOrgId } = useOrgContext();
  const notify = useNotification();
  const [selectedContactId, setSelectedContactId] = useState("");
  const [previewData, setPreviewData] = useState<any>(null);

  // Fetch contacts for testing
  const { data: contacts, isLoading: loadingContacts } = useQuery({
    queryKey: ["contacts_for_test", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, email")
        .eq("org_id", effectiveOrgId)
        .limit(100)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId && open,
  });

  // Preview email mutation
  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!selectedContactId) throw new Error("Please select a contact");
      
      const { data, error } = await supabase.functions.invoke('automation-trigger-handler', {
        body: {
          orgId: effectiveOrgId,
          triggerType: 'test',
          contactId: selectedContactId,
          ruleId: rule.id,
          preview: true,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setPreviewData(data);
      notify.success("Preview Generated", "Email preview is ready below");
    },
    onError: (error: any) => {
      notify.error("Preview Failed", error);
    },
  });

  // Send test email mutation
  const sendTestMutation = useMutation({
    mutationFn: async () => {
      if (!selectedContactId) throw new Error("Please select a contact");
      
      const { data, error } = await supabase.functions.invoke('automation-trigger-handler', {
        body: {
          orgId: effectiveOrgId,
          triggerType: 'test',
          contactId: selectedContactId,
          ruleId: rule.id,
          preview: false,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      notify.success("Test Email Sent", "Check the recipient's inbox");
      onOpenChange(false);
    },
    onError: (error: any) => {
      notify.error("Test Failed", error);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Test Automation Rule</DialogTitle>
          <DialogDescription>
            Preview or send a test email to verify your automation rule works correctly
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Select Test Contact</Label>
            <Select value={selectedContactId} onValueChange={setSelectedContactId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a contact to test with" />
              </SelectTrigger>
              <SelectContent>
                {loadingContacts ? (
                  <div className="p-4 text-center text-muted-foreground">
                    Loading contacts...
                  </div>
                ) : (
                  contacts?.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {contact.first_name} {contact.last_name} ({contact.email})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => previewMutation.mutate()}
              disabled={!selectedContactId || previewMutation.isPending}
              variant="outline"
            >
              {previewMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Eye className="mr-2 h-4 w-4" />
              )}
              Preview Email
            </Button>
            <Button
              onClick={() => sendTestMutation.mutate()}
              disabled={!selectedContactId || sendTestMutation.isPending}
            >
              {sendTestMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send Test Email
            </Button>
          </div>

          {previewData && (
            <Card>
              <CardHeader>
                <CardTitle>Email Preview</CardTitle>
                <CardDescription>
                  This is how the email will look when sent
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px] w-full">
                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-semibold">Subject:</Label>
                      <p className="text-sm mt-1">{previewData.subject}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold">From:</Label>
                      <p className="text-sm mt-1">{previewData.from_email}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold">To:</Label>
                      <p className="text-sm mt-1">{previewData.to_email}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold">Body:</Label>
                      <div 
                        className="mt-2 p-4 border rounded-md bg-muted/50"
                        dangerouslySetInnerHTML={{ __html: previewData.html_content }}
                      />
                    </div>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
