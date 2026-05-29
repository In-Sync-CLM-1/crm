import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useNotification } from "@/hooks/useNotification";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface SaveReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportData: {
    dataSource: string;
    configuration: any;
  };
  orgId: string;
  onSaved?: () => void;
}

export default function SaveReportDialog({
  open,
  onOpenChange,
  reportData,
  orgId,
  onSaved,
}: SaveReportDialogProps) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const notify = useNotification();

  const handleSave = async () => {
    if (!name.trim()) {
      notify.error("Name required", new Error("Please enter a name for your report"));
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.from('saved_reports').insert({
        org_id: orgId,
        name: name.trim(),
        description: description.trim(),
        data_source: reportData.dataSource,
        configuration: reportData.configuration,
        is_public: isPublic,
      });

      if (error) throw error;

      notify.success("Report saved", "Your report has been saved successfully");

      setName("");
      setDescription("");
      setIsPublic(false);
      onOpenChange(false);
      onSaved?.();
      navigate('/reports');
    } catch (error: any) {
      notify.error("Error saving report", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Report</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="report-name">Report Name</Label>
            <Input
              id="report-name"
              placeholder="e.g., Monthly Sales Report"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="report-description">Description (Optional)</Label>
            <Textarea
              id="report-description"
              placeholder="Describe what this report shows..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is-public"
              checked={isPublic}
              onCheckedChange={(checked) => setIsPublic(checked as boolean)}
            />
            <label
              htmlFor="is-public"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Share with team
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
