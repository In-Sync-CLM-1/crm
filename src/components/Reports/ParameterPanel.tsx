import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportFilter, ReportParameters } from "@/utils/reportQueryBuilder";
import { DataSource } from "@/config/reportDataSources";
import { Plus, Trash2, Calendar } from "lucide-react";
import { format } from "date-fns";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface ParameterPanelProps {
  dataSource: DataSource;
  parameters: ReportParameters;
  onChange: (parameters: ReportParameters) => void;
}

export default function ParameterPanel({ dataSource, parameters, onChange }: ParameterPanelProps) {
  const addFilter = () => {
    const newFilter: ReportFilter = {
      field: dataSource.fields[0]?.key || '',
      operator: 'equals',
      value: '',
    };
    onChange({
      ...parameters,
      filters: [...parameters.filters, newFilter],
    });
  };

  const updateFilter = (index: number, updatedFilter: Partial<ReportFilter>) => {
    const newFilters = [...parameters.filters];
    newFilters[index] = { ...newFilters[index], ...updatedFilter };
    onChange({ ...parameters, filters: newFilters });
  };

  const removeFilter = (index: number) => {
    onChange({
      ...parameters,
      filters: parameters.filters.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Parameters</h3>

      {/* Date Range */}
      <Card className="p-4 space-y-3">
        <Label>Date Range</Label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">From</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <Calendar className="mr-2 h-4 w-4" />
                  {parameters.dateRange?.from ? format(new Date(parameters.dateRange.from), 'PPP') : 'Pick date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <CalendarComponent
                  mode="single"
                  selected={parameters.dateRange?.from ? new Date(parameters.dateRange.from) : undefined}
                  onSelect={(date) => onChange({
                    ...parameters,
                    dateRange: { ...parameters.dateRange, from: date ? format(date, 'yyyy-MM-dd') : '', to: parameters.dateRange?.to || '' }
                  })}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <Calendar className="mr-2 h-4 w-4" />
                  {parameters.dateRange?.to ? format(new Date(parameters.dateRange.to), 'PPP') : 'Pick date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <CalendarComponent
                  mode="single"
                  selected={parameters.dateRange?.to ? new Date(parameters.dateRange.to) : undefined}
                  onSelect={(date) => onChange({
                    ...parameters,
                    dateRange: { from: parameters.dateRange?.from || '', to: date ? format(date, 'yyyy-MM-dd') : '', ...parameters.dateRange }
                  })}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </Card>

      {/* Filters */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label>Filters</Label>
          <Button size="sm" variant="outline" onClick={addFilter}>
            <Plus className="h-4 w-4 mr-1" />
            Add Filter
          </Button>
        </div>

        {parameters.filters.map((filter, index) => (
          <div key={index} className="flex gap-2 items-start">
            <Select
              value={filter.field}
              onValueChange={(value) => updateFilter(index, { field: value })}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Field" />
              </SelectTrigger>
              <SelectContent>
                {dataSource.fields.map(field => (
                  <SelectItem key={field.key} value={field.key}>
                    {field.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filter.operator}
              onValueChange={(value: any) => updateFilter(index, { operator: value })}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="equals">Equals</SelectItem>
                <SelectItem value="not_equals">Not Equals</SelectItem>
                <SelectItem value="contains">Contains</SelectItem>
                <SelectItem value="greater_than">Greater Than</SelectItem>
                <SelectItem value="less_than">Less Than</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder="Value"
              value={filter.value}
              onChange={(e) => updateFilter(index, { value: e.target.value })}
              className="flex-1"
            />

            <Button size="icon" variant="ghost" onClick={() => removeFilter(index)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </Card>

      {/* Group By */}
      <Card className="p-4 space-y-3">
        <Label>Group By</Label>
        <Select
          value={parameters.groupBy || 'none'}
          onValueChange={(value) => onChange({ ...parameters, groupBy: value === 'none' ? undefined : value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="No grouping" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No grouping</SelectItem>
            {dataSource.fields.filter(f => f.type !== 'number').map(field => (
              <SelectItem key={field.key} value={field.key}>
                {field.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      {/* Limit */}
      <Card className="p-4 space-y-3">
        <Label>Row Limit</Label>
        <Input
          type="number"
          placeholder="No limit"
          value={parameters.limit || ''}
          onChange={(e) => onChange({ ...parameters, limit: e.target.value ? Number(e.target.value) : undefined })}
        />
      </Card>
    </div>
  );
}
