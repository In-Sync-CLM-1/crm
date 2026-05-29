import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Code2 } from "lucide-react";

interface VariableInserterProps {
  onInsert: (variable: string) => void;
}

export const VariableInserter = ({ onInsert }: VariableInserterProps) => {
  const contactVariables = [
    { group: "Personal", vars: [
      { label: "First Name", value: "first_name" },
      { label: "Last Name", value: "last_name" },
      { label: "Email", value: "email" },
      { label: "Phone", value: "phone" },
    ]},
    { group: "Professional", vars: [
      { label: "Company", value: "company" },
      { label: "Job Title", value: "job_title" },
    ]},
    { group: "Location", vars: [
      { label: "Address", value: "address" },
      { label: "City", value: "city" },
      { label: "State", value: "state" },
      { label: "Postal Code", value: "postal_code" },
      { label: "Country", value: "country" },
    ]},
    { group: "Links", vars: [
      { label: "Website", value: "website" },
      { label: "LinkedIn URL", value: "linkedin_url" },
    ]},
    { group: "Other", vars: [
      { label: "Source", value: "source" },
      { label: "Status", value: "status" },
      { label: "Notes", value: "notes" },
      { label: "Referred By", value: "referred_by" },
    ]},
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Code2 className="h-4 w-4 mr-2" />
          Insert Variable
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Contact Fields</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {contactVariables.map((group) => (
          <div key={group.group}>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {group.group}
            </DropdownMenuLabel>
            {group.vars.map((variable) => (
              <DropdownMenuItem
                key={variable.value}
                onClick={() => onInsert(`{{${variable.value}}}`)}
              >
                {variable.label}
                <span className="ml-auto text-xs text-muted-foreground">
                  {`{{${variable.value}}}`}
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
