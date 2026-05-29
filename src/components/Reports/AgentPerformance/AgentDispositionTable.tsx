import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface AgentDispositionTableProps {
  data: any[];
  isLoading: boolean;
}

export default function AgentDispositionTable({ data, isLoading }: AgentDispositionTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent Performance Details</CardTitle>
        <CardDescription>Detailed call metrics and disposition breakdown</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No agent performance data available
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Total Calls</TableHead>
                <TableHead className="text-right">Avg Duration</TableHead>
                <TableHead className="text-right">Answered</TableHead>
                <TableHead className="text-right">Missed</TableHead>
                <TableHead>Top Disposition</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((agent) => {
                const avgDuration = Number(agent.avg_duration_seconds || 0);
                const dispositionBreakdown = agent.disposition_breakdown || {};
                const topDisposition = Object.keys(dispositionBreakdown).length > 0
                  ? Object.entries(dispositionBreakdown).sort((a: any, b: any) => b[1] - a[1])[0]
                  : null;

                return (
                  <TableRow key={agent.agent_id}>
                    <TableCell className="font-medium">{agent.agent_name}</TableCell>
                    <TableCell className="text-right">{agent.total_calls}</TableCell>
                    <TableCell className="text-right">
                      {Math.floor(avgDuration / 60)}m {Math.round(avgDuration % 60)}s
                    </TableCell>
                    <TableCell className="text-right">{agent.answered_calls || 0}</TableCell>
                    <TableCell className="text-right">{agent.missed_calls || 0}</TableCell>
                    <TableCell>
                      {topDisposition ? `${topDisposition[0]} (${topDisposition[1]})` : 'N/A'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
