import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useNotification } from "@/hooks/useNotification";
import { Loader2, Save, Eye } from "lucide-react";
import { useOrgContext } from "@/hooks/useOrgContext";
import EmailEditor, { EditorRef, EmailEditorProps } from "react-email-editor";

interface EmailTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: {
    id: string;
    name: string;
    subject: string;
    design_json: any;
  } | null;
  onSuccess: () => void;
}

export const EmailTemplateDialog = ({ open, onOpenChange, template, onSuccess }: EmailTemplateDialogProps) => {
  const notify = useNotification();
  const { effectiveOrgId } = useOrgContext();
  const emailEditorRef = useRef<EditorRef>(null);

  const [templateName, setTemplateName] = useState(template?.name || "");
  const [subject, setSubject] = useState(template?.subject || "");
  const [loading, setLoading] = useState(false);
  const [editorReady, setEditorReady] = useState(false);

  const onReady: EmailEditorProps["onReady"] = () => {
    setEditorReady(true);
    if (template?.design_json && emailEditorRef.current) {
      setTimeout(() => {
        emailEditorRef.current?.editor?.loadDesign(template.design_json);
      }, 100);
    }
  };

  const handleSave = async () => {
    if (!templateName.trim() || !subject.trim()) {
      notify.error("Validation Error", new Error("Please provide template name and subject"));
      return;
    }

    if (!emailEditorRef.current) {
      notify.error("Error", new Error("Email editor not initialized"));
      return;
    }

    setLoading(true);

    try {
      emailEditorRef.current.editor?.exportHtml(async (data) => {
        const { design, html } = data;

        const templateData = {
          name: templateName.trim(),
          subject: subject.trim(),
          design_json: design,
          html_content: html,
          org_id: effectiveOrgId,
        };

        if (template?.id) {
          // Update existing template
          const { error } = await supabase
            .from("email_templates")
            .update(templateData)
            .eq("id", template.id);

          if (error) throw error;

          notify.success("Success", "Template updated successfully");
        } else {
          // Create new template
          const { data: session } = await supabase.auth.getSession();
          const { error } = await supabase
            .from("email_templates")
            .insert({
              ...templateData,
              created_by: session.session?.user.id,
            });

          if (error) throw error;

          notify.success("Success", "Template created successfully");
        }

        setLoading(false);
        onSuccess();
        onOpenChange(false);
        // Reset form
        setTemplateName("");
        setSubject("");
      });
    } catch (error: any) {
      console.error("Error saving template:", error);
      notify.error("Error", error);
      setLoading(false);
    }
  };

  const handlePreview = () => {
    if (!emailEditorRef.current) return;

    emailEditorRef.current.editor?.exportHtml((data) => {
      const { html } = data;
      const previewWindow = window.open("", "_blank");
      if (previewWindow) {
        previewWindow.document.write(html);
        previewWindow.document.close();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {template ? "Edit Email Template" : "Create Email Template"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name</Label>
              <Input
                id="name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Welcome Email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">Email Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., Welcome to our platform!"
              />
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden" style={{ height: "500px" }}>
            <EmailEditor
              ref={emailEditorRef}
              onReady={onReady}
              minHeight="500px"
              options={{
                mergeTags: {
                  first_name: {
                    name: "First Name",
                    value: "{{first_name}}",
                  },
                  last_name: {
                    name: "Last Name",
                    value: "{{last_name}}",
                  },
                  email: {
                    name: "Email",
                    value: "{{email}}",
                  },
                  company: {
                    name: "Company",
                    value: "{{company}}",
                  },
                  phone: {
                    name: "Phone",
                    value: "{{phone}}",
                  },
                },
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handlePreview} variant="outline" disabled={!editorReady}>
            <Eye className="mr-2 h-4 w-4" />
            Preview
          </Button>
          <Button onClick={handleSave} disabled={loading || !editorReady}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {template ? "Update" : "Save"} Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
