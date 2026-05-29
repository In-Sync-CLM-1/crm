import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNotification } from "@/hooks/useNotification";
import { Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface FormField {
  id: string;
  custom_field_id: string;
  field_order: number;
  custom_field: {
    field_name: string;
    field_label: string;
    field_type: string;
    field_options: any;
    is_required: boolean;
  };
}

interface FormData {
  id: string;
  name: string;
  description: string;
  org_id: string;
}

interface FillFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  onFormFilled: () => void;
}

export function FillFormDialog({ open, onOpenChange, contactId, onFormFilled }: FillFormDialogProps) {
  const notify = useNotification();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [forms, setForms] = useState<FormData[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string>("");
  const [fields, setFields] = useState<FormField[]>([]);
  const [formValues, setFormValues] = useState<Record<string, any>>({});

  useEffect(() => {
    if (open) {
      fetchForms();
    }
  }, [open]);

  useEffect(() => {
    if (selectedFormId) {
      fetchFormFields();
    } else {
      setFields([]);
      setFormValues({});
    }
  }, [selectedFormId]);

  const fetchForms = async () => {
    try {
      const { data, error } = await supabase
        .from("forms")
        .select("id, name, description, org_id")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setForms(data || []);
    } catch (error: any) {
      notify.error("Error loading forms", error);
    }
  };

  const fetchFormFields = async () => {
    setLoading(true);
    try {
      const { data: fieldsData, error: fieldsError } = await supabase
        .from("form_fields")
        .select(`
          id,
          custom_field_id,
          field_order,
          custom_fields (
            field_name,
            field_label,
            field_type,
            field_options,
            is_required
          )
        `)
        .eq("form_id", selectedFormId)
        .order("field_order");

      if (fieldsError) throw fieldsError;

      const transformedFields = (fieldsData || []).map((field: any) => ({
        id: field.id,
        custom_field_id: field.custom_field_id,
        field_order: field.field_order,
        custom_field: field.custom_fields,
      }));

      setFields(transformedFields);
    } catch (error: any) {
      notify.error("Error loading form fields", error);
    } finally{
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Validate required fields
      for (const field of fields) {
        if (field.custom_field.is_required && !formValues[field.custom_field.field_name]) {
          throw new Error(`${field.custom_field.field_label} is required`);
        }
      }

      // Check if there's a pipeline_stage field
      const pipelineStageField = fields.find(
        field => field.custom_field.field_name === "pipeline_stage"
      );
      const pipelineStageValue = pipelineStageField 
        ? formValues[pipelineStageField.custom_field.field_name]
        : null;

      // Delete existing custom field values for this contact and form
      const customFieldIds = fields.map(f => f.custom_field_id);
      await supabase
        .from("contact_custom_fields")
        .delete()
        .eq("contact_id", contactId)
        .in("custom_field_id", customFieldIds);

      // Insert new custom field values
      const customFieldValues = fields
        .filter(field => formValues[field.custom_field.field_name] !== undefined && formValues[field.custom_field.field_name] !== "")
        .map(field => ({
          contact_id: contactId,
          custom_field_id: field.custom_field_id,
          field_value: typeof formValues[field.custom_field.field_name] === 'object'
            ? JSON.stringify(formValues[field.custom_field.field_name])
            : String(formValues[field.custom_field.field_name]),
        }));

      if (customFieldValues.length > 0) {
        const { error: customFieldsError } = await supabase
          .from("contact_custom_fields")
          .insert(customFieldValues);

        if (customFieldsError) throw customFieldsError;
      }

      // If pipeline stage was set, update the contact's pipeline_stage_id
      if (pipelineStageValue) {
        const { error: updateError } = await supabase
          .from("contacts")
          .update({ pipeline_stage_id: pipelineStageValue })
          .eq("id", contactId);

        if (updateError) throw updateError;

        // Log an activity for the pipeline stage change
        const { data: stageData } = await supabase
          .from("pipeline_stages")
          .select("name")
          .eq("id", pipelineStageValue)
          .single();

        const { data: contactData } = await supabase
          .from("contacts")
          .select("org_id")
          .eq("id", contactId)
          .single();

        const { data: { user } } = await supabase.auth.getUser();

        if (stageData && contactData) {
          await supabase.from("contact_activities").insert({
            contact_id: contactId,
            org_id: contactData.org_id,
            activity_type: "note",
            subject: "Pipeline Stage Updated",
            description: `Pipeline stage changed to: ${stageData.name}`,
            created_by: user?.id,
            completed_at: new Date().toISOString(),
          });
        }
      }

      notify.success("Form filled successfully", "Contact information has been updated.");

      onFormFilled();
      onOpenChange(false);
      setSelectedFormId("");
      setFormValues({});
    } catch (error: any) {
      notify.error("Error submitting form", error);
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (field: FormField) => {
    const { field_name, field_label, field_type, field_options, is_required } = field.custom_field;

    switch (field_type) {
      case "text":
      case "email":
      case "phone":
      case "url":
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field_name}>
              {field_label} {is_required && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id={field_name}
              type={field_type === "email" ? "email" : field_type === "phone" ? "tel" : field_type === "url" ? "url" : "text"}
              value={formValues[field_name] || ""}
              onChange={(e) => setFormValues({ ...formValues, [field_name]: e.target.value })}
              required={is_required}
            />
          </div>
        );

      case "textarea":
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field_name}>
              {field_label} {is_required && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              id={field_name}
              value={formValues[field_name] || ""}
              onChange={(e) => setFormValues({ ...formValues, [field_name]: e.target.value })}
              required={is_required}
              rows={4}
            />
          </div>
        );

      case "number":
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field_name}>
              {field_label} {is_required && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id={field_name}
              type="number"
              value={formValues[field_name] || ""}
              onChange={(e) => setFormValues({ ...formValues, [field_name]: e.target.value })}
              required={is_required}
            />
          </div>
        );

      case "select":
      case "dropdown":
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field_name}>
              {field_label} {is_required && <span className="text-destructive">*</span>}
            </Label>
            <Select
              value={formValues[field_name] || ""}
              onValueChange={(value) => setFormValues({ ...formValues, [field_name]: value })}
              required={is_required}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                {field_options?.options?.map((option: string) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      case "checkbox":
        return (
          <div key={field.id} className="flex items-center space-x-2">
            <Checkbox
              id={field_name}
              checked={formValues[field_name] || false}
              onCheckedChange={(checked) => setFormValues({ ...formValues, [field_name]: checked })}
            />
            <Label htmlFor={field_name} className="cursor-pointer">
              {field_label} {is_required && <span className="text-destructive">*</span>}
            </Label>
          </div>
        );

      case "date":
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field_name}>
              {field_label} {is_required && <span className="text-destructive">*</span>}
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !formValues[field_name] && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formValues[field_name] ? format(new Date(formValues[field_name]), "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={formValues[field_name] ? new Date(formValues[field_name]) : undefined}
                  onSelect={(date) => setFormValues({ ...formValues, [field_name]: date?.toISOString() })}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fill Form</DialogTitle>
          <DialogDescription>
            Select a form and fill out the information for this contact.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="form-select">Select Form</Label>
            <Select value={selectedFormId} onValueChange={setSelectedFormId}>
              <SelectTrigger id="form-select">
                <SelectValue placeholder="Choose a form" />
              </SelectTrigger>
              <SelectContent>
                {forms.map((form) => (
                  <SelectItem key={form.id} value={form.id}>
                    {form.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}

          {!loading && selectedFormId && fields.length > 0 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {fields.map(renderField)}
              
              <div className="flex gap-2 pt-4">
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Form Data"
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {!loading && selectedFormId && fields.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              This form has no fields configured.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
