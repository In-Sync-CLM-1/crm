import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface PerformanceTrendChartProps {
  data: Array<{
    date: string;
    spend: number;
    conversions: number;
    roas: number;
  }>;
  isLoading?: boolean;
}

export default function PerformanceTrendChart({ data, isLoading }: PerformanceTrendChartProps) {
  if (isLoading) {
    return <Skeleton className="h-[300px] w-full" />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        No data available
      </div>
    );
  }

  // Group by date and sum metrics
  const chartData = Object.values(
    data.reduce((acc, curr) => {
      const date = new Date(curr.date).toLocaleDateString();
      if (!acc[date]) {
        acc[date] = { date, spend: 0, conversions: 0, revenue: 0 };
      }
      acc[date].spend += curr.spend || 0;
      acc[date].conversions += curr.conversions || 0;
      acc[date].revenue += curr.roas ? (curr.roas * (curr.spend || 0)) : 0;
      return acc;
    }, {} as Record<string, any>)
  ).map(item => ({
    ...item,
    roas: item.spend > 0 ? item.revenue / item.spend : 0
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="date" className="text-xs" />
        <YAxis className="text-xs" />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: 'hsl(var(--card))', 
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px'
          }}
        />
        <Legend />
        <Line type="monotone" dataKey="spend" stroke="hsl(var(--primary))" name="Spend ($)" />
        <Line type="monotone" dataKey="conversions" stroke="hsl(var(--chart-2))" name="Conversions" />
        <Line type="monotone" dataKey="roas" stroke="hsl(var(--chart-3))" name="ROAS" />
      </LineChart>
    </ResponsiveContainer>
  );
}