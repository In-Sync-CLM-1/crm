import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { executeReportQuery, ReportParameters } from "@/utils/reportQueryBuilder";
import { DataSourceType, getDataSource } from "@/config/reportDataSources";

interface ReportChartConfig {
  chartType: 'bar' | 'line' | 'pie';
  xAxis: string;
  yAxis: string;
}

interface ReportChartComponentProps {
  config: ReportChartConfig;
  dataSource: DataSourceType;
  parameters: ReportParameters;
  orgId: string;
  onConfigChange: (config: ReportChartConfig) => void;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function ReportChartComponent({
  config,
  dataSource,
  parameters,
  orgId,
  onConfigChange,
}: ReportChartComponentProps) {
  const source = getDataSource(dataSource);

  const { data, isLoading } = useQuery({
    queryKey: ['report-chart', dataSource, parameters, config.xAxis, config.yAxis],
    queryFn: async () => {
      if (!config.xAxis) return [];
      
      const result = await executeReportQuery(
        dataSource,
        { ...parameters, groupBy: config.xAxis },
        orgId,
        [config.xAxis, config.yAxis].filter(Boolean)
      );
      
      return result;
    },
    enabled: !!config.xAxis,
  });

  const xAxisFields = source.fields.filter(f => f.type !== 'number' || f.key === 'id');
  const yAxisFields = source.fields.filter(f => f.aggregations && f.aggregations.length > 0);

  if (!config.xAxis || !config.yAxis) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Chart Type</Label>
            <Select
              value={config.chartType}
              onValueChange={(value: any) => onConfigChange({ ...config, chartType: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bar">Bar Chart</SelectItem>
                <SelectItem value="line">Line Chart</SelectItem>
                <SelectItem value="pie">Pie Chart</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>X-Axis (Group By)</Label>
            <Select
              value={config.xAxis}
              onValueChange={(value) => onConfigChange({ ...config, xAxis: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select field" />
              </SelectTrigger>
              <SelectContent>
                {xAxisFields.map(field => (
                  <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Y-Axis (Metric)</Label>
            <Select
              value={config.yAxis}
              onValueChange={(value) => onConfigChange({ ...config, yAxis: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select metric" />
              </SelectTrigger>
              <SelectContent>
                {yAxisFields.map(field => (
                  <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <Skeleton className="h-[300px] w-full" />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        No data available for the selected configuration
      </div>
    );
  }

  const yAxisKey = config.yAxis === 'id' ? 'count' : `${config.yAxis}_count`;

  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        {config.chartType === 'bar' ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey={config.xAxis} className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
            <Legend />
            <Bar dataKey={yAxisKey} fill="hsl(var(--primary))" name={source.fields.find(f => f.key === config.yAxis)?.label} />
          </BarChart>
        ) : config.chartType === 'line' ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey={config.xAxis} className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
            <Legend />
            <Line type="monotone" dataKey={yAxisKey} stroke="hsl(var(--primary))" name={source.fields.find(f => f.key === config.yAxis)?.label} />
          </LineChart>
        ) : (
          <PieChart>
            <Pie
              data={data}
              dataKey={yAxisKey}
              nameKey={config.xAxis}
              cx="50%"
              cy="50%"
              outerRadius={100}
              label
            >
              {data.map((entry: any, index: number) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
