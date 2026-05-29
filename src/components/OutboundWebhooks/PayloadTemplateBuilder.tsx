import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface PayloadTemplateBuilderProps {
  template: any;
  onChange: (template: any) => void;
  targetTable: string;
  targetOperation: string;
}

export const PayloadTemplateBuilder = ({
  template,
  onChange,
  targetTable,
  targetOperation,
}: PayloadTemplateBuilderProps) => {
  const [jsonValue, setJsonValue] = useState(
    JSON.stringify(template || getDefaultTemplate(targetTable, targetOperation), null, 2)
  );
  const [error, setError] = useState<string | null>(null);

  // Fetch table columns dynamically
  const { data: tableColumns } = useQuery({
    queryKey: ['table-columns', targetTable],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('information_schema.columns' as any)
        .select('column_name, data_type')
        .eq('table_name', targetTable)
        .eq('table_schema', 'public')
        .order('ordinal_position');
      
      if (error) throw error;
      return data;
    },
    enabled: !!targetTable
  });

  // Update template when table or operation changes
  useEffect(() => {
    if (!template) {
      const defaultTemplate = getDefaultTemplate(targetTable, targetOperation);
      setJsonValue(JSON.stringify(defaultTemplate, null, 2));
      onChange(defaultTemplate);
    }
  }, [targetTable, targetOperation]);

  const handleChange = (value: string) => {
    setJsonValue(value);
    try {
      const parsed = JSON.parse(value);
      onChange(parsed);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const getAvailableVariables = () => {
    const common = [
      "{{org_id}}",
      "{{timestamp}}",
    ];

    if (!tableColumns || tableColumns.length === 0) return common;

    if (targetOperation === 'INSERT' || targetOperation === 'DELETE') {
      // For INSERT/DELETE: flat structure {{column_name}}
      return [
        ...common,
        ...tableColumns.map((col: any) => `{{${col.column_name}}}`)
      ];
    } else if (targetOperation === 'UPDATE') {
      // For UPDATE: nested structure {{old.column}} {{new.column}}
      const oldVars = tableColumns.map((col: any) => `{{old.${col.column_name}}}`);
      const newVars = tableColumns.map((col: any) => `{{new.${col.column_name}}}`);
      return [...common, ...oldVars, ...newVars];
    }

    return common;
  };

  const insertVariable = (variable: string) => {
    const textarea = document.getElementById("payload-template") as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = jsonValue;
    const newText = text.substring(0, start) + variable + text.substring(end);

    setJsonValue(newText);
    handleChange(newText);

    // Restore cursor position
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + variable.length;
      textarea.focus();
    }, 0);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-4 bg-muted rounded-lg">
        <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <p className="font-medium mb-1">How to use variables:</p>
          <p>
            Use <code className="px-1 bg-background rounded">{"{{variable}}"}</code> syntax
            to insert dynamic values. Click any variable below to insert it at cursor position.
          </p>
          {targetOperation === 'UPDATE' && (
            <p className="mt-2 text-xs">
              <strong>For UPDATE events:</strong> Use <code className="px-1 bg-background rounded">{"{{old.field}}"}</code> for previous values 
              and <code className="px-1 bg-background rounded">{"{{new.field}}"}</code> for new values.
            </p>
          )}
          {(targetOperation === 'INSERT' || targetOperation === 'DELETE') && (
            <p className="mt-2 text-xs">
              <strong>For {targetOperation} events:</strong> Use <code className="px-1 bg-background rounded">{"{{field}}"}</code> directly 
              (e.g., <code className="px-1 bg-background rounded">{"{{id}}"}</code>, <code className="px-1 bg-background rounded">{"{{email}}"}</code>).
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Available Variables</Label>
        <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
          {getAvailableVariables().map((variable) => (
            <Badge
              key={variable}
              variant="outline"
              className="cursor-pointer hover:bg-accent"
              onClick={() => insertVariable(variable)}
            >
              {variable}
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="payload-template">Payload Template (JSON)</Label>
        <Textarea
          id="payload-template"
          value={jsonValue}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Enter JSON template..."
          className="font-mono text-sm min-h-[300px]"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          const formatted = JSON.stringify(JSON.parse(jsonValue), null, 2);
          setJsonValue(formatted);
        }}
        disabled={!!error}
      >
        Format JSON
      </Button>
    </div>
  );
};

function getDefaultTemplate(targetTable: string, targetOperation: string): any {
  if (targetOperation === 'INSERT') {
    return {
      event: `${targetTable}_created`,
      timestamp: "{{created_at}}",
      table: targetTable,
      data: {
        id: "{{id}}",
        org_id: "{{org_id}}"
      }
    };
  } else if (targetOperation === 'UPDATE') {
    return {
      event: `${targetTable}_updated`,
      timestamp: "{{new.updated_at}}",
      table: targetTable,
      changes: {
        old: { id: "{{old.id}}" },
        new: { id: "{{new.id}}" }
      }
    };
  } else if (targetOperation === 'DELETE') {
    return {
      event: `${targetTable}_deleted`,
      timestamp: "{{deleted_at}}",
      table: targetTable,
      deleted_record: {
        id: "{{id}}"
      }
    };
  }

  return {
    event: targetTable,
    timestamp: "{{timestamp}}",
  };
}
