import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { executeReportQuery, ReportParameters } from "@/utils/reportQueryBuilder";
import { DataSourceType, getDataSource } from "@/config/reportDataSources";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ReportTableConfig {
  columns: string[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface ReportTableComponentProps {
  config: ReportTableConfig;
  dataSource: DataSourceType;
  parameters: ReportParameters;
  orgId: string;
  onConfigChange: (config: ReportTableConfig) => void;
}

export default function ReportTableComponent({
  config,
  dataSource,
  parameters,
  orgId,
  onConfigChange,
}: ReportTableComponentProps) {
  const source = getDataSource(dataSource);

  const { data, isLoading } = useQuery({
    queryKey: ['report-table', dataSource, parameters, config.columns, config.sortBy, config.sortOrder],
    queryFn: () => executeReportQuery(
      dataSource,
      { ...parameters, sortBy: config.sortBy, sortOrder: config.sortOrder, limit: config.sortBy ? parameters.limit : 100 },
      orgId,
      config.columns.length > 0 ? config.columns : undefined
    ),
    enabled: config.columns.length > 0,
  });

  const toggleColumn = (fieldKey: string) => {
    const newColumns = config.columns.includes(fieldKey)
      ? config.columns.filter(k => k !== fieldKey)
      : [...config.columns, fieldKey];
    onConfigChange({ ...config, columns: newColumns });
  };

  if (config.columns.length === 0) {
    return (
      <div className="space-y-3">
        <Label>Select Columns to Display</Label>
        <ScrollArea className="h-[200px] border rounded-md p-3">
          <div className="space-y-2">
            {source.fields.map(field => (
              <div key={field.key} className="flex items-center space-x-2">
                <Checkbox
                  id={`field-${field.key}`}
                  checked={config.columns.includes(field.key)}
                  onCheckedChange={() => toggleColumn(field.key)}
                />
                <label
                  htmlFor={`field-${field.key}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {field.label}
                </label>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs">Sort By</Label>
          <Select
            value={config.sortBy || 'none'}
            onValueChange={(value) => onConfigChange({ ...config, sortBy: value === 'none' ? undefined : value })}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="No sorting" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No sorting</SelectItem>
              {config.columns.map(col => {
                const field = source.fields.find(f => f.key === col);
                return field ? (
                  <SelectItem key={col} value={col}>{field.label}</SelectItem>
                ) : null;
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="w-[120px]">
          <Label className="text-xs">Order</Label>
          <Select
            value={config.sortOrder || 'desc'}
            onValueChange={(value: 'asc' | 'desc') => onConfigChange({ ...config, sortOrder: value })}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">Ascending</SelectItem>
              <SelectItem value="desc">Descending</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <ScrollArea className="h-[300px] border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              {config.columns.map(col => {
                const field = source.fields.find(f => f.key === col);
                return field ? (
                  <TableHead key={col}>{field.label}</TableHead>
                ) : null;
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                {config.columns.map((_, i) => (
                  <TableCell key={i}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ) : data && data.length > 0 ? (
              data.map((row: any, i: number) => (
                <TableRow key={i}>
                  {config.columns.map(col => (
                    <TableCell key={col}>{row[col] || '-'}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={config.columns.length} className="text-center text-muted-foreground">
                  No data available
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
