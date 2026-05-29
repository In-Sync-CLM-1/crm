import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useNotification } from "@/hooks/useNotification";
import { LoadingState } from "@/components/common/LoadingState";
import { Plus, Mail, Download, RefreshCw } from "lucide-react";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { format } from "date-fns";
import { exportToCSV, ExportColumn, formatDateForExport } from "@/utils/exportUtils";

interface Campaign {
  id: string;
  name: string;
  subject: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  pending_count: number;
  created_at: string;
}

const EmailCampaigns = () => {
  const navigate = useNavigate();
  const notify = useNotification();
  const { effectiveOrgId } = useOrgContext();

  const fetchCampaigns = async () => {
    const { data, error } = await supabase
      .from("email_bulk_campaigns")
      .select("*")
      .eq("org_id", effectiveOrgId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  };

  const { data: campaigns = [], isLoading, refetch } = useQuery({
    queryKey: ['email-campaigns', effectiveOrgId],
    queryFn: fetchCampaigns,
    enabled: !!effectiveOrgId,
  });

  // Realtime subscription using standardized hook
  useRealtimeSync({
    table: 'email_bulk_campaigns',
    filter: `org_id=eq.${effectiveOrgId}`,
    onUpdate: refetch,
    onInsert: refetch,
    enabled: !!effectiveOrgId,
  });

  const handleExport = () => {
    try {
      const columns: ExportColumn[] = [
        { key: 'name', label: 'Campaign Name' },
        { key: 'subject', label: 'Subject' },
        { key: 'status', label: 'Status' },
        { key: 'total_recipients', label: 'Total Recipients' },
        { key: 'sent_count', label: 'Sent' },
        { key: 'failed_count', label: 'Failed' },
        { key: 'pending_count', label: 'Pending' },
        { key: 'created_at', label: 'Created', format: formatDateForExport },
      ];

      exportToCSV(campaigns, columns, `email-campaigns-${new Date().toISOString().split('T')[0]}`);
      
      notify.success("Success", "Campaigns exported successfully");
    } catch (error) {
      notify.error("Error", "Failed to export campaigns");
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      draft: "secondary",
      sending: "default",
      completed: "default",
      failed: "destructive",
    };
    return <Badge variant={variants[status] || "secondary"}>{status}</Badge>;
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <LoadingState message="Loading email campaigns..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Email Campaigns</h1>
            <p className="text-muted-foreground">
              View and manage your email campaigns
            </p>
            <p className="text-xs text-muted-foreground mt-1">Auto-updates in real-time</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={campaigns.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button onClick={() => navigate("/bulk-email")}>
              <Plus className="mr-2 h-4 w-4" />
              New Campaign
            </Button>
          </div>
        </div>

        {campaigns.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Mail className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No campaigns yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create your first email campaign to get started
              </p>
              <Button onClick={() => navigate("/bulk-email")}>
                <Plus className="mr-2 h-4 w-4" />
                Create Campaign
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>All Campaigns</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="py-2 text-xs">Campaign Name</TableHead>
                    <TableHead className="py-2 text-xs">Subject</TableHead>
                    <TableHead className="py-2 text-xs">Status</TableHead>
                    <TableHead className="py-2 text-xs">Recipients</TableHead>
                    <TableHead className="py-2 text-xs">Sent</TableHead>
                    <TableHead className="py-2 text-xs">Failed</TableHead>
                    <TableHead className="py-2 text-xs">Created</TableHead>
                    <TableHead className="py-2 text-xs"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((campaign) => (
                    <TableRow
                      key={campaign.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/email-campaigns/${campaign.id}`)}
                    >
                      <TableCell className="py-1.5 font-medium text-xs">{campaign.name}</TableCell>
                      <TableCell className="py-1.5 text-xs">{campaign.subject}</TableCell>
                      <TableCell className="py-1.5">{getStatusBadge(campaign.status)}</TableCell>
                      <TableCell className="py-1.5 text-xs">{campaign.total_recipients}</TableCell>
                      <TableCell className="py-1.5 text-xs">{campaign.sent_count}</TableCell>
                      <TableCell className="py-1.5 text-xs">{campaign.failed_count}</TableCell>
                      <TableCell className="py-1.5 text-xs">
                        {format(new Date(campaign.created_at), "PP")}
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/email-campaigns/${campaign.id}`);
                          }}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default EmailCampaigns;
