import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

interface PerformanceTrendChartProps {
  data: any[];
  isLoading: boolean;
  channelType: "email" | "whatsapp";
}

export default function PerformanceTrendChart({ data, isLoading, channelType }: PerformanceTrendChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map(campaign => ({
    name: format(new Date(campaign.created_at), 'MMM dd'),
    sent: campaign.sent_count || 0,
    failed: campaign.failed_count || 0,
  })).slice(0, 10).reverse();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance Trend</CardTitle>
        <CardDescription>Campaign send and failure rates over time</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="sent" stroke="hsl(var(--primary))" name="Sent" />
            <Line type="monotone" dataKey="failed" stroke="hsl(var(--destructive))" name="Failed" />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
