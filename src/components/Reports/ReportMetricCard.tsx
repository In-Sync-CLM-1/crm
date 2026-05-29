import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { executeAggregationQuery, ReportParameters } from "@/utils/reportQueryBuilder";
import { DataSourceType, getDataSource } from "@/config/reportDataSources";

interface ReportMetricConfig {
  field: string;
  operation: 'count' | 'sum' | 'avg' | 'min' | 'max';
  label: string;
}

interface ReportMetricCardProps {
  config: ReportMetricConfig;
  dataSource: DataSourceType;
  parameters: ReportParameters;
  orgId: string;
  onConfigChange: (config: ReportMetricConfig) => void;
}

export default function ReportMetricCard({
  config,
  dataSource,
  parameters,
  orgId,
  onConfigChange,
}: ReportMetricCardProps) {
  const source = getDataSource(dataSource);

  const { data, isLoading } = useQuery({
    queryKey: ['report-metric', dataSource, parameters, config.field, config.operation],
    queryFn: () => executeAggregationQuery(dataSource, config.field, config.operation, parameters, orgId),
    enabled: !!config.field && !!config.operation,
  });

  const aggregableFields = source.fields.filter(f => f.aggregations && f.aggregations.length > 0);

  if (!config.field || !config.operation) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Field</Label>
            <Select
              value={config.field}
              onValueChange={(value) => {
                const field = source.fields.find(f => f.key === value);
                onConfigChange({ 
                  ...config, 
                  field: value,
                  operation: field?.aggregations?.[0] || 'count'
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select field" />
              </SelectTrigger>
              <SelectContent>
                {aggregableFields.map(field => (
                  <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Operation</Label>
            <Select
              value={config.operation}
              onValueChange={(value: any) => onConfigChange({ ...config, operation: value })}
              disabled={!config.field}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {config.field && aggregableFields.find(f => f.key === config.field)?.aggregations?.map(agg => (
                  <SelectItem key={agg} value={agg}>{agg.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>Label</Label>
          <Input
            placeholder="e.g., Total Contacts"
            value={config.label}
            onChange={(e) => onConfigChange({ ...config, label: e.target.value })}
          />
        </div>
      </div>
    );
  }

  const displayLabel = config.label || `${config.operation.toUpperCase()} ${source.fields.find(f => f.key === config.field)?.label}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">{displayLabel}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-10 w-24" />
        ) : (
          <div className="text-3xl font-bold">
            {typeof data === 'number' ? Math.round(data * 100) / 100 : data}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
