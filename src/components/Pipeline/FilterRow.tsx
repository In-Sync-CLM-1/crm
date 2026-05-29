import { SearchableField, Filter } from "@/pages/PipelineAdvancedSearch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X } from "lucide-react";

interface FilterRowProps {
  filter: Filter;
  fields: SearchableField[];
  onUpdate: (updates: Partial<Filter>) => void;
  onRemove: () => void;
  canRemove: boolean;
}

const getOperatorsForFieldType = (type: string) => {
  switch (type) {
    case 'text':
    case 'email':
    case 'phone':
      return [
        { value: 'contains', label: 'Contains' },
        { value: 'not_contains', label: 'Does not contain' },
        { value: 'equals', label: 'Equals' },
        { value: 'not_equals', label: 'Not equals' },
        { value: 'starts_with', label: 'Starts with' },
        { value: 'ends_with', label: 'Ends with' },
        { value: 'is_empty', label: 'Is empty' },
        { value: 'is_not_empty', label: 'Is not empty' },
      ];
    case 'number':
      return [
        { value: 'equals', label: 'Equals' },
        { value: 'not_equals', label: 'Not equals' },
        { value: 'greater_than', label: 'Greater than' },
        { value: 'less_than', label: 'Less than' },
        { value: 'between', label: 'Between' },
        { value: 'is_empty', label: 'Is empty' },
        { value: 'is_not_empty', label: 'Is not empty' },
      ];
    case 'date':
      return [
        { value: 'equals', label: 'Equals' },
        { value: 'before', label: 'Before' },
        { value: 'after', label: 'After' },
        { value: 'between', label: 'Between' },
        { value: 'is_empty', label: 'Is empty' },
        { value: 'is_not_empty', label: 'Is not empty' },
      ];
    case 'select':
      return [
        { value: 'equals', label: 'Is' },
        { value: 'not_equals', label: 'Is not' },
        { value: 'is_empty', label: 'Is empty' },
        { value: 'is_not_empty', label: 'Is not empty' },
      ];
    case 'boolean':
      return [
        { value: 'equals', label: 'Is true' },
        { value: 'not_equals', label: 'Is false' },
      ];
    default:
      return [];
  }
};

const FilterRow = ({ filter, fields, onUpdate, onRemove, canRemove }: FilterRowProps) => {
  const selectedField = fields.find(f => f.id === filter.fieldId);
  const operators = selectedField ? getOperatorsForFieldType(selectedField.type) : [];
  const showValueInput = filter.operator && filter.operator !== 'is_empty' && filter.operator !== 'is_not_empty';

  const groupedFields = fields.reduce((acc, field) => {
    if (!acc[field.category]) {
      acc[field.category] = [];
    }
    acc[field.category].push(field);
    return acc;
  }, {} as Record<string, SearchableField[]>);

  const categoryLabels: Record<string, string> = {
    basic: 'Basic Info',
    contact_info: 'Contact Info',
    business: 'Business',
    location: 'Location',
    pipeline: 'Pipeline',
    custom: 'Custom Fields',
  };

  return (
    <div className="flex gap-2 items-start p-4 border rounded-lg bg-card">
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
        {/* Field Selector */}
        <Select value={filter.fieldId} onValueChange={(value) => onUpdate({ fieldId: value, operator: '', value: '' })}>
          <SelectTrigger>
            <SelectValue placeholder="Select field..." />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(groupedFields).map(([category, categoryFields]) => (
              <div key={category}>
                <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                  {categoryLabels[category] || category}
                </div>
                {categoryFields.map((field) => (
                  <SelectItem key={field.id} value={field.id}>
                    {field.label}
                  </SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>

        {/* Operator Selector */}
        <Select 
          value={filter.operator} 
          onValueChange={(value) => onUpdate({ operator: value })}
          disabled={!filter.fieldId}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select operator..." />
          </SelectTrigger>
          <SelectContent>
            {operators.map((op) => (
              <SelectItem key={op.value} value={op.value}>
                {op.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Value Input */}
        {showValueInput && (
          <>
            {filter.operator === 'between' ? (
              <div className="flex gap-2">
                <Input
                  type={selectedField?.type === 'number' ? 'number' : selectedField?.type === 'date' ? 'date' : 'text'}
                  placeholder="From"
                  value={filter.value?.from || ''}
                  onChange={(e) => onUpdate({ value: { ...filter.value, from: e.target.value } })}
                />
                <Input
                  type={selectedField?.type === 'number' ? 'number' : selectedField?.type === 'date' ? 'date' : 'text'}
                  placeholder="To"
                  value={filter.value?.to || ''}
                  onChange={(e) => onUpdate({ value: { ...filter.value, to: e.target.value } })}
                />
              </div>
            ) : selectedField?.type === 'select' && selectedField.options ? (
              <Select value={filter.value} onValueChange={(value) => onUpdate({ value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select value..." />
                </SelectTrigger>
                <SelectContent>
                  {selectedField.options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                type={selectedField?.type === 'number' ? 'number' : selectedField?.type === 'date' ? 'date' : 'text'}
                placeholder="Enter value..."
                value={filter.value || ''}
                onChange={(e) => onUpdate({ value: e.target.value })}
              />
            )}
          </>
        )}
      </div>

      {canRemove && (
        <Button variant="ghost" size="icon" onClick={onRemove} className="shrink-0">
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};

export default FilterRow;
