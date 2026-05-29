import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface AgentCallsChartProps {
  data: any[];
  isLoading: boolean;
}

export default function AgentCallsChart({ data, isLoading }: AgentCallsChartProps) {
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

  const chartData = data.map(agent => ({
    name: agent.agent_name,
    inbound: Number(agent.inbound_calls || 0),
    outbound: Number(agent.outbound_calls || 0),
  })).slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent Call Distribution</CardTitle>
        <CardDescription>Inbound vs Outbound calls by agent</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No call data available for this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="inbound" fill="hsl(var(--primary))" name="Inbound" />
              <Bar dataKey="outbound" fill="hsl(var(--secondary))" name="Outbound" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
