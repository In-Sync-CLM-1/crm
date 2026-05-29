import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNotification } from "@/hooks/useNotification";
import { Loader2, CheckCircle, FileText } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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

export default function PublicForm() {
  const { formId } = useParams();
  const navigate = useNavigate();
  const notify = useNotification();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<FormData | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [formValues, setFormValues] = useState<Record<string, any>>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    company: "",
  });
  const [formStartTime] = useState(Date.now()); // Track form load time for bot detection

  useEffect(() => {
    if (formId) {
      fetchForm();
    }
  }, [formId]);

  const fetchForm = async () => {
    try {
      // Fetch form details
      const { data: formData, error: formError } = await supabase
        .from("forms")
        .select("id, name, description, org_id")
        .eq("id", formId)
        .eq("is_active", true)
        .single();

      if (formError) throw formError;
      if (!formData) throw new Error("Form not found");

      setForm(formData);

      // Fetch form fields with custom field details
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
        .eq("form_id", formId)
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
      notify.error("Error loading form", error);
      setTimeout(() => navigate("/"), 3000);
    } finally{
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (!form) throw new Error("Form data not loaded");

      // Validate required fields
      for (const field of fields) {
        if (field.custom_field.is_required && !formValues[field.custom_field.field_name]) {
          throw new Error(`${field.custom_field.field_label} is required`);
        }
      }

      // Validate base contact fields
      if (!formValues.first_name || !formValues.email) {
        throw new Error("First name and email are required");
      }

      // Prepare custom fields data
      const customFields: Record<string, string> = {};
      fields.forEach(field => {
        const value = formValues[field.custom_field.field_name];
        if (value) {
          customFields[field.custom_field_id] = typeof value === 'object'
            ? JSON.stringify(value)
            : String(value);
        }
      });

      // Submit via secure edge function with rate limiting and validation
      const { data, error } = await supabase.functions.invoke('submit-public-form', {
        body: {
          formId: form.id,
          orgId: form.org_id,
          firstName: formValues.first_name,
          lastName: formValues.last_name || undefined,
          email: formValues.email,
          phone: formValues.phone || undefined,
          customFields,
          honeypot: '', // Empty honeypot field for bot detection
          submissionTime: Date.now() - formStartTime, // Time taken to fill form
        },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.message || data.error);
      }

      setSubmitted(true);
      notify.success("Form submitted successfully", "Thank you for your submission. We'll be in touch soon!");
    } catch (error: any) {
      const errorMessage = error.message || "Failed to submit form";
      
      // Handle rate limiting
      if (error.message?.includes('Rate limit') || error.message?.includes('Too many')) {
        notify.error("Submission Limit Reached", errorMessage);
      } else if (error.message?.includes('Bot detected') || error.message?.includes('too fast')) {
        notify.error("Invalid Submission", "Please try again more slowly.");
      } else {
        notify.error("Error submitting form", errorMessage);
      }
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
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-8">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-muted-foreground">Loading form...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-8 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Thank You!</h2>
            <p className="text-muted-foreground">
              Your form has been submitted successfully. We'll be in touch soon.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-8 text-center">
            <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Form Not Found</h2>
            <p className="text-muted-foreground">
              The form you're looking for doesn't exist or is no longer active.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl">{form.name}</CardTitle>
          {form.description && (
            <CardDescription>{form.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Base Contact Fields */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Contact Information</h3>
              
              <div className="space-y-2">
                <Label htmlFor="first_name">
                  First Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="first_name"
                  value={formValues.first_name}
                  onChange={(e) => setFormValues({ ...formValues, first_name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name</Label>
                <Input
                  id="last_name"
                  value={formValues.last_name}
                  onChange={(e) => setFormValues({ ...formValues, last_name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">
                  Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formValues.email}
                  onChange={(e) => setFormValues({ ...formValues, email: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formValues.phone}
                  onChange={(e) => setFormValues({ ...formValues, phone: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  value={formValues.company}
                  onChange={(e) => setFormValues({ ...formValues, company: e.target.value })}
                />
              </div>
            </div>

            {/* Custom Fields */}
            {fields.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Additional Information</h3>
                {fields.map(renderField)}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Form"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
