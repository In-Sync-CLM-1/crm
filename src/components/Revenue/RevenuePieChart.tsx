import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { PieChart as PieChartIcon } from "lucide-react";

interface RevenuePieChartProps {
  paidAmount: number;
  outstandingAmount: number;
  overdueAmount: number;
  currency?: string;
}

const COLORS = {
  paid: "#10B981",
  outstanding: "#F59E0B",
  overdue: "#EF4444",
};

export function RevenuePieChart({
  paidAmount,
  outstandingAmount,
  overdueAmount,
  currency = "INR",
}: RevenuePieChartProps) {
  const total = paidAmount + outstandingAmount + overdueAmount;
  
  const data = [
    { name: "Paid", value: paidAmount, color: COLORS.paid },
    { name: "Outstanding", value: outstandingAmount, color: COLORS.outstanding },
    { name: "Overdue", value: overdueAmount, color: COLORS.overdue },
  ].filter((item) => item.value > 0);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatShortCurrency = (value: number) => {
    if (value >= 10000000) {
      return `₹${(value / 10000000).toFixed(1)}Cr`;
    }
    if (value >= 100000) {
      return `₹${(value / 100000).toFixed(1)}L`;
    }
    if (value >= 1000) {
      return `₹${(value / 1000).toFixed(0)}K`;
    }
    return `₹${value}`;
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <PieChartIcon className="h-5 w-5 text-primary" />
          Payment Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] relative">
          {total === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No invoice data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend
                  formatter={(value, entry: any) => (
                    <span className="text-sm">
                      {value}: {formatShortCurrency(entry.payload.value)}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
          {/* Center text */}
          {total > 0 && (
            <div className="absolute top-[40%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-bold">{formatShortCurrency(total)}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
