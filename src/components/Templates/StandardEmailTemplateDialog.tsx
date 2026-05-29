import { useState, useEffect } from "react";
import { VariableGuide } from "./VariableGuide";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNotification } from "@/hooks/useNotification";
import { supabase } from "@/integrations/supabase/client";
import { CTAButtonManager, CTAButton } from "./CTAButtonManager";
import { AttachmentManager, Attachment } from "./AttachmentManager";
import { VariableInserter } from "./VariableInserter";
import { EmailPreview } from "./EmailPreview";
import { RichTextEditor } from "./RichTextEditor";
import { Loader2 } from "lucide-react";

interface StandardEmailTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: any;
  onSuccess: () => void;
}

export const StandardEmailTemplateDialog = ({
  open,
  onOpenChange,
  template,
  onSuccess,
}: StandardEmailTemplateDialogProps) => {
  const [templateName, setTemplateName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyContent, setBodyContent] = useState("");
  const [buttons, setButtons] = useState<CTAButton[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [orgId, setOrgId] = useState("");
  const notify = useNotification();

  useEffect(() => {
    const fetchOrgId = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('org_id')
          .eq('id', user.id)
          .single();
        if (profile) setOrgId(profile.org_id);
      }
    };
    fetchOrgId();
  }, []);

  useEffect(() => {
    if (template) {
      setTemplateName(template.name || "");
      setSubject(template.subject || "");
      setBodyContent(template.body_content || template.html_content || "");
      setButtons(template.buttons || []);
      setAttachments(template.attachments || []);
    } else {
      setTemplateName("");
      setSubject("");
      setBodyContent("");
      setButtons([]);
      setAttachments([]);
    }
  }, [template, open]);

  const handleSave = async () => {
    if (!templateName.trim() || !subject.trim()) {
      notify.error("Missing required fields", new Error("Please provide template name and subject"));
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const templateData = {
        name: templateName.trim(),
        subject: subject.trim(),
        body_content: bodyContent,
        buttons: JSON.parse(JSON.stringify(buttons)),
        attachments: JSON.parse(JSON.stringify(attachments)),
        org_id: orgId,
        created_by: user.id,
        is_active: true,
      };

      if (template) {
        const { error } = await supabase
          .from('email_templates')
          .update(templateData)
          .eq('id', template.id);

        if (error) throw error;

        notify.success("Template updated", "Email template has been updated successfully");
      } else {
        const { error } = await supabase
          .from('email_templates')
          .insert([templateData]);

        if (error) throw error;

        notify.success("Template created", "Email template has been created successfully");
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Save error:', error);
      notify.error("Error", new Error("Failed to save template. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const insertVariable = (variable: string) => {
    setBodyContent(prev => prev + variable);
  };

  const insertSubjectVariable = (variable: string) => {
    setSubject(prev => prev + variable);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {template ? 'Edit Email Template' : 'Create Email Template'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="template-name">Template Name</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Welcome Email"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="subject">Subject Line</Label>
                <VariableInserter onInsert={insertSubjectVariable} />
              </div>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Welcome to {{company}}!"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="body-content">Email Body</Label>
                <VariableInserter onInsert={insertVariable} />
              </div>
              <RichTextEditor
                value={bodyContent}
                onChange={setBodyContent}
                placeholder="Hi {{first_name}}, Welcome to our platform! Best regards, The Team"
              />
              <p className="text-xs text-muted-foreground">
                Use variables like {`{{first_name}}`}, {`{{company}}`}, {`{{trigger.old_stage}}`} for personalization.
              </p>
            </div>

            <Tabs defaultValue="buttons" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="buttons">CTA Buttons</TabsTrigger>
                <TabsTrigger value="attachments">Attachments</TabsTrigger>
                <TabsTrigger value="variables">Variables</TabsTrigger>
              </TabsList>
              <TabsContent value="buttons" className="mt-4">
                <CTAButtonManager buttons={buttons} onChange={setButtons} />
              </TabsContent>
              <TabsContent value="attachments" className="mt-4">
                <AttachmentManager 
                  attachments={attachments} 
                  onChange={setAttachments}
                  orgId={orgId}
                />
              </TabsContent>
              <TabsContent value="variables" className="mt-4">
                <VariableGuide />
              </TabsContent>
            </Tabs>
          </div>

          <div className="lg:sticky lg:top-6 lg:self-start">
            <EmailPreview
              subject={subject}
              bodyContent={bodyContent}
              buttons={buttons}
              attachments={attachments}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {template ? 'Update Template' : 'Create Template'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
