import { AreaChart, Area, ResponsiveContainer } from "recharts";

interface MiniSparklineProps {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
  showTrend?: boolean;
}

export function MiniSparkline({ 
  data, 
  color = "hsl(var(--primary))", 
  height = 20, 
  width = 50,
  showTrend = true 
}: MiniSparklineProps) {
  if (!data || data.length < 2) return null;

  // Determine trend color
  const trend = data[data.length - 1] - data[0];
  const trendColor = showTrend 
    ? (trend >= 0 ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)") 
    : color;

  const chartData = data.map((value, index) => ({ value, index }));

  return (
    <div style={{ width, height }} className="inline-block ml-1.5">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`sparkGradient-${data.join('-')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={trendColor} stopOpacity={0.4} />
              <stop offset="100%" stopColor={trendColor} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={trendColor}
            strokeWidth={1.5}
            fill={`url(#sparkGradient-${data.join('-')})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
