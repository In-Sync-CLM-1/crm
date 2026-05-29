import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface FilterRule {
  field: string;
  operator: string;
  value: string;
}

interface FilterConditionsBuilderProps {
  conditions: any;
  onChange: (conditions: any) => void;
  targetTable: string;
  targetOperation: string;
}

export const FilterConditionsBuilder = ({
  conditions,
  onChange,
  targetTable,
  targetOperation,
}: FilterConditionsBuilderProps) => {
  const [rules, setRules] = useState<FilterRule[]>([]);

  // Fetch table columns dynamically
  const { data: tableColumns } = useQuery({
    queryKey: ['table-columns-filter', targetTable],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('information_schema.columns' as any)
        .select('column_name')
        .eq('table_name', targetTable)
        .eq('table_schema', 'public')
        .order('ordinal_position');
      
      if (error) throw error;
      return data.map((col: any) => ({
        value: col.column_name,
        label: col.column_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      }));
    },
    enabled: !!targetTable
  });

  useEffect(() => {
    if (conditions?.rules) {
      setRules(conditions.rules);
    }
  }, [conditions]);

  const operators = [
    { value: "eq", label: "Equals" },
    { value: "neq", label: "Not Equals" },
    { value: "gt", label: "Greater Than" },
    { value: "lt", label: "Less Than" },
    { value: "gte", label: "Greater or Equal" },
    { value: "lte", label: "Less or Equal" },
    { value: "contains", label: "Contains" },
    { value: "not_contains", label: "Not Contains" },
    { value: "is_null", label: "Is Null" },
    { value: "is_not_null", label: "Is Not Null" },
  ];

  const addRule = () => {
    const newRule: FilterRule = {
      field: tableColumns?.[0]?.value || "",
      operator: "eq",
      value: "",
    };
    const newRules = [...rules, newRule];
    setRules(newRules);
    updateConditions(newRules);
  };

  const removeRule = (index: number) => {
    const newRules = rules.filter((_, i) => i !== index);
    setRules(newRules);
    updateConditions(newRules);
  };

  const updateRule = (index: number, updates: Partial<FilterRule>) => {
    const newRules = rules.map((rule, i) =>
      i === index ? { ...rule, ...updates } : rule
    );
    setRules(newRules);
    updateConditions(newRules);
  };

  const updateConditions = (newRules: FilterRule[]) => {
    onChange({
      logic: "AND",
      rules: newRules,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-4 bg-muted rounded-lg">
        <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <p className="font-medium mb-1">Filter Conditions</p>
          <p>
            Only trigger the webhook when records match these conditions.
            All conditions must be true (AND logic).
          </p>
          {targetOperation === 'UPDATE' && (
            <p className="mt-2 text-xs text-amber-600">
              <strong>Note:</strong> For UPDATE operations, filters check the NEW values.
            </p>
          )}
        </div>
      </div>

      {rules.length === 0 ? (
        <div className="text-center py-8 border border-dashed rounded-lg">
          <p className="text-muted-foreground mb-4">
            No filters configured. Webhook will trigger for all {targetTable} events.
          </p>
          <Button onClick={addRule} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Filter
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule, index) => (
            <div key={index} className="flex items-end gap-2 p-4 border rounded-lg">
              <div className="flex-1 space-y-2">
                <Label>Field</Label>
                <Select
                  value={rule.field}
                  onValueChange={(value) => updateRule(index, { field: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tableColumns?.map((field: any) => (
                      <SelectItem key={field.value} value={field.value}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1 space-y-2">
                <Label>Operator</Label>
                <Select
                  value={rule.operator}
                  onValueChange={(value) => updateRule(index, { operator: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {operators.map((op) => (
                      <SelectItem key={op.value} value={op.value}>
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1 space-y-2">
                <Label>Value</Label>
                <Input
                  value={rule.value}
                  onChange={(e) => updateRule(index, { value: e.target.value })}
                  placeholder="Enter value..."
                  disabled={rule.operator === "is_null" || rule.operator === "is_not_null"}
                />
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeRule(index)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button onClick={addRule} variant="outline" size="sm" className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add Another Filter
          </Button>
        </div>
      )}
    </div>
  );
}
