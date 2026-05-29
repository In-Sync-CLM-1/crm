import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MonthlyData {
  qualified: number;
  proposals: number;
  deals: number;
  invoiced: number;
  received: number;
}

interface ProgressionChartProps {
  monthlyActuals: Record<string, MonthlyData>;
}

const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

// Same targets as MonthlyGoalTracker
const monthlyTargets: Record<string, { revenue: number }> = {
  JAN: { revenue: 200000 },
  FEB: { revenue: 400000 },
  MAR: { revenue: 800000 },
  APR: { revenue: 700000 },
  MAY: { revenue: 900000 },
  JUN: { revenue: 1000000 },
  JUL: { revenue: 900000 },
  AUG: { revenue: 1100000 },
  SEP: { revenue: 900000 },
  OCT: { revenue: 1100000 },
  NOV: { revenue: 1100000 },
  DEC: { revenue: 1200000 },
};

const formatCompact = (value: number): string => {
  if (value >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return value.toString();
};

export function ProgressionChart({ monthlyActuals }: ProgressionChartProps) {
  // Build cumulative progression data showing single target vs actual invoiced and received
  const chartData = useMemo(() => {
    let cumTarget = 0;
    let cumActualInvoiced = 0;
    let cumActualReceived = 0;

    return months.map((month) => {
      const target = monthlyTargets[month];
      const actual = monthlyActuals[month] || { qualified: 0, proposals: 0, deals: 0, invoiced: 0, received: 0 };

      cumTarget += target.revenue;
      cumActualInvoiced += actual.invoiced;
      cumActualReceived += actual.received;

      return {
        month,
        target: cumTarget,
        invoiced: cumActualInvoiced,
        received: cumActualReceived,
      };
    });
  }, [monthlyActuals]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-sm">
          <p className="font-semibold text-foreground mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 py-0.5">
              <div 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}:</span>
              <span className="font-medium text-foreground">
                {formatCompact(entry.value)}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="animate-fade-in">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Target vs Achievement Progression</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 pb-2">
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
                axisLine={{ className: "stroke-border" }}
                tickLine={{ className: "stroke-border" }}
              />
              <YAxis 
                tickFormatter={formatCompact}
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
                axisLine={{ className: "stroke-border" }}
                tickLine={{ className: "stroke-border" }}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                verticalAlign="top" 
                height={36}
                iconType="line"
                iconSize={16}
                wrapperStyle={{ fontSize: '12px' }}
                formatter={(value) => <span className="text-foreground text-xs">{value}</span>}
              />
              
              {/* Target - dashed slate line */}
              <Line
                type="monotone"
                dataKey="target"
                name="Target"
                stroke="hsl(220, 9%, 46%)"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                animationDuration={1200}
              />
              
              {/* Actual Invoiced - solid blue line */}
              <Line
                type="monotone"
                dataKey="invoiced"
                name="Invoiced"
                stroke="hsl(217, 91%, 60%)"
                strokeWidth={2.5}
                dot={{ fill: "hsl(217, 91%, 60%)", strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
                animationDuration={1200}
              />
              
              {/* Actual Received - solid teal line */}
              <Line
                type="monotone"
                dataKey="received"
                name="Received"
                stroke="hsl(173, 80%, 40%)"
                strokeWidth={2.5}
                dot={{ fill: "hsl(173, 80%, 40%)", strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
                animationDuration={1200}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
