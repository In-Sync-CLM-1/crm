import { supabase } from "@/integrations/supabase/client";
import { DataSourceType, getDataSource } from "@/config/reportDataSources";

export interface ReportFilter {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'between';
  value: any;
}

export interface ReportParameters {
  dateRange?: { from: string; to: string; field?: string };
  filters: ReportFilter[];
  groupBy?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

export interface AggregationConfig {
  field: string;
  operation: 'count' | 'sum' | 'avg' | 'min' | 'max';
}

export async function executeReportQuery(
  dataSource: DataSourceType,
  parameters: ReportParameters,
  orgId: string,
  columns?: string[],
  aggregations?: AggregationConfig[]
): Promise<any[]> {
  const source = getDataSource(dataSource);
  
  const { data, error } = await supabase
    .from(source.table as any)
    .select(columns?.join(',') || '*')
    .eq('org_id', orgId);

  if (error) throw error;
  
  let result = data || [];

  // Apply filters manually
  if (parameters.filters.length > 0) {
    result = result.filter(row => {
      return parameters.filters.every(filter => {
        const value = row[filter.field];
        switch (filter.operator) {
          case 'equals': return value === filter.value;
          case 'not_equals': return value !== filter.value;
          case 'contains': return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
          case 'greater_than': return Number(value) > Number(filter.value);
          case 'less_than': return Number(value) < Number(filter.value);
          case 'in': return Array.isArray(filter.value) && filter.value.includes(value);
          default: return true;
        }
      });
    });
  }

  // Apply sorting
  if (parameters.sortBy) {
    result.sort((a, b) => {
      const aVal = a[parameters.sortBy!];
      const bVal = b[parameters.sortBy!];
      const order = parameters.sortOrder === 'asc' ? 1 : -1;
      return aVal > bVal ? order : aVal < bVal ? -order : 0;
    });
  }

  // Apply limit
  if (parameters.limit) {
    result = result.slice(0, parameters.limit);
  }

  // Apply grouping
  if (parameters.groupBy) {
    return applyGrouping(result, parameters.groupBy, aggregations);
  }

  return result;
}

function applyGrouping(
  data: any[],
  groupByField: string,
  aggregations?: AggregationConfig[]
): any[] {
  const grouped: Record<string, any[]> = {};
  
  data.forEach(row => {
    const key = row[groupByField] || 'Unknown';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  });

  return Object.entries(grouped).map(([groupValue, rows]) => {
    const result: any = { [groupByField]: groupValue };
    
    if (aggregations) {
      aggregations.forEach(agg => {
        const values = rows.map(r => r[agg.field]).filter(v => v != null);
        result[`${agg.field}_${agg.operation}`] = values.length > 0 ? Math.round(values.reduce((s, v) => s + Number(v), 0) / (agg.operation === 'avg' ? values.length : 1)) : 0;
      });
    } else {
      result.count = rows.length;
    }
    
    return result;
  });
}

export async function executeAggregationQuery(
  dataSource: DataSourceType,
  field: string,
  operation: 'count' | 'sum' | 'avg' | 'min' | 'max',
  parameters: ReportParameters,
  orgId: string
): Promise<number> {
  const data = await executeReportQuery(dataSource, parameters, orgId);
  
  if (operation === 'count') return data.length;
  
  const values = data.map(row => Number(row[field])).filter(v => !isNaN(v));
  if (values.length === 0) return 0;
  
  switch (operation) {
    case 'sum': return values.reduce((s, v) => s + v, 0);
    case 'avg': return values.reduce((s, v) => s + v, 0) / values.length;
    case 'min': return Math.min(...values);
    case 'max': return Math.max(...values);
    default: return 0;
  }
}
