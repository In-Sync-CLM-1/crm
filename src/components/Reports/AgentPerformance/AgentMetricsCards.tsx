import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, Clock, CheckCircle, XCircle } from "lucide-react";

interface AgentMetricsCardsProps {
  data: any[];
  isLoading: boolean;
}

export default function AgentMetricsCards({ data, isLoading }: AgentMetricsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4 rounded" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-32 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const totalCalls = data.reduce((sum, agent) => sum + Number(agent.total_calls || 0), 0);
  const totalDuration = data.reduce((sum, agent) => sum + Number(agent.total_duration_seconds || 0), 0);
  const totalAnswered = data.reduce((sum, agent) => sum + Number(agent.answered_calls || 0), 0);
  const totalMissed = data.reduce((sum, agent) => sum + Number(agent.missed_calls || 0), 0);
  const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
          <Phone className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalCalls}</div>
          <p className="text-xs text-muted-foreground">Across all agents</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{Math.floor(avgDuration / 60)}m {avgDuration % 60}s</div>
          <p className="text-xs text-muted-foreground">Per call average</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Answered</CardTitle>
          <CheckCircle className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalAnswered}</div>
          <p className="text-xs text-muted-foreground">
            {totalCalls > 0 ? Math.round((totalAnswered / totalCalls) * 100) : 0}% answer rate
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Missed</CardTitle>
          <XCircle className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalMissed}</div>
          <p className="text-xs text-muted-foreground">
            {totalCalls > 0 ? Math.round((totalMissed / totalCalls) * 100) : 0}% miss rate
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
