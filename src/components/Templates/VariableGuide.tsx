import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Copy } from "lucide-react";
import { useNotification } from "@/hooks/useNotification";
import { Button } from "@/components/ui/button";

interface VariableCategory {
  title: string;
  description: string;
  variables: Array<{
    variable: string;
    description: string;
    example?: string;
  }>;
}

export function VariableGuide() {
  const notify = useNotification();

  const copyVariable = (variable: string) => {
    navigator.clipboard.writeText(variable);
    notify.success("Copied!", `${variable} copied to clipboard`);
  };

  const categories: VariableCategory[] = [
    {
      title: "Contact Information",
      description: "Basic contact details",
      variables: [
        { variable: "{{first_name}}", description: "Contact's first name", example: "John" },
        { variable: "{{last_name}}", description: "Contact's last name", example: "Smith" },
        { variable: "{{full_name}}", description: "Full name", example: "John Smith" },
        { variable: "{{email}}", description: "Email address", example: "john@company.com" },
        { variable: "{{phone}}", description: "Phone number", example: "+1234567890" },
        { variable: "{{company}}", description: "Company name", example: "Acme Corp" },
        { variable: "{{job_title}}", description: "Job title", example: "Marketing Director" },
        { variable: "{{city}}", description: "City", example: "New York" },
        { variable: "{{state}}", description: "State/Province", example: "NY" },
        { variable: "{{country}}", description: "Country", example: "USA" },
      ],
    },
    {
      title: "Contact Metadata",
      description: "Status and tracking information",
      variables: [
        { variable: "{{status}}", description: "Contact status", example: "active" },
        { variable: "{{source}}", description: "Lead source", example: "website" },
        { variable: "{{pipeline_stage}}", description: "Current pipeline stage", example: "Qualified" },
        { variable: "{{assigned_to_name}}", description: "Assigned user's name", example: "Jane Doe" },
        { variable: "{{assigned_to_email}}", description: "Assigned user's email", example: "jane@company.com" },
        { variable: "{{created_date}}", description: "Contact creation date", example: "1/15/2024" },
        { variable: "{{created_date_long}}", description: "Long format creation date", example: "January 15, 2024" },
        { variable: "{{days_since_last_contact}}", description: "Days since last activity", example: "7" },
      ],
    },
    {
      title: "Custom Fields",
      description: "Access any custom field value",
      variables: [
        { variable: "{{custom_field.field_name}}", description: "Replace 'field_name' with actual field name", example: "{{custom_field.budget}}" },
      ],
    },
    {
      title: "Trigger Data - Stage Change",
      description: "Available when triggered by stage changes",
      variables: [
        { variable: "{{trigger.old_stage}}", description: "Previous stage name", example: "New" },
        { variable: "{{trigger.new_stage}}", description: "New stage name", example: "Qualified" },
        { variable: "{{trigger.from_stage}}", description: "Alias for old_stage", example: "New" },
        { variable: "{{trigger.to_stage}}", description: "Alias for new_stage", example: "Qualified" },
      ],
    },
    {
      title: "Trigger Data - Call Disposition",
      description: "Available when triggered by call dispositions",
      variables: [
        { variable: "{{trigger.disposition}}", description: "Disposition name", example: "Interested" },
        { variable: "{{trigger.disposition_description}}", description: "Disposition details", example: "Customer showed interest" },
        { variable: "{{trigger.call_duration}}", description: "Call duration formatted", example: "5m 30s" },
        { variable: "{{trigger.call_duration_minutes}}", description: "Call duration in minutes", example: "5" },
      ],
    },
    {
      title: "Trigger Data - Activity",
      description: "Available when triggered by activities",
      variables: [
        { variable: "{{trigger.activity_type}}", description: "Type of activity", example: "meeting" },
        { variable: "{{trigger.subject}}", description: "Activity subject", example: "Product Demo" },
        { variable: "{{trigger.description}}", description: "Activity description", example: "Discussed pricing..." },
      ],
    },
    {
      title: "Conditional Content",
      description: "Show/hide content based on conditions",
      variables: [
        { 
          variable: "{{#if company}}...{{/if}}", 
          description: "Show content only if company exists",
          example: "{{#if company}}Your company {{company}} is...{{/if}}"
        },
        { 
          variable: "{{#if company}}...{{else}}...{{/if}}", 
          description: "Show different content based on condition",
          example: "{{#if company}}Hi {{first_name}} from {{company}}{{else}}Hi {{first_name}}{{/if}}"
        },
        { 
          variable: '{{#if status == "active"}}...{{/if}}', 
          description: "Check if field equals value",
          example: '{{#if status == "active"}}You are an active customer{{/if}}'
        },
      ],
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Available Variables</CardTitle>
        <CardDescription>
          Click any variable to copy it to your clipboard
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-6">
            {categories.map((category) => (
              <div key={category.title} className="space-y-3">
                <div>
                  <h3 className="font-semibold text-sm">{category.title}</h3>
                  <p className="text-xs text-muted-foreground">{category.description}</p>
                </div>
                <div className="space-y-2">
                  {category.variables.map((v) => (
                    <div
                      key={v.variable}
                      className="flex items-start justify-between gap-2 rounded-lg border p-3 hover:bg-accent/50 transition-colors group"
                    >
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="font-mono text-xs">
                            {v.variable}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{v.description}</p>
                        {v.example && (
                          <p className="text-xs text-muted-foreground italic">
                            Example: {v.example}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyVariable(v.variable)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
