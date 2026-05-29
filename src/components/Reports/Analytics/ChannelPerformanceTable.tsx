import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface ChannelPerformanceTableProps {
  data: any[];
  isLoading: boolean;
  channelType: "email" | "whatsapp";
}

export default function ChannelPerformanceTable({ data, isLoading, channelType }: ChannelPerformanceTableProps) {
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
        <CardTitle>Campaign Performance</CardTitle>
        <CardDescription>Detailed metrics for each campaign</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No {channelType} campaigns found for this period
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign Name</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell className="font-medium">{campaign.name || campaign.campaign_name}</TableCell>
                  <TableCell>{format(new Date(campaign.created_at), 'MMM dd, yyyy')}</TableCell>
                  <TableCell className="text-right">{campaign.sent_count || 0}</TableCell>
                  <TableCell className="text-right">{campaign.failed_count || 0}</TableCell>
                  <TableCell className="text-right">{campaign.pending_count || 0}</TableCell>
                  <TableCell>
                    <Badge variant={
                      campaign.status === 'completed' ? 'default' :
                      campaign.status === 'failed' ? 'destructive' :
                      'secondary'
                    }>
                      {campaign.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
