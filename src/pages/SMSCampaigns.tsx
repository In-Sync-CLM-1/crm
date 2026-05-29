import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useOrgContext } from "@/hooks/useOrgContext";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useNotification } from "@/hooks/useNotification";
import { Plus, RefreshCw, Eye, Trash2, Download } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { exportToCSV, ExportColumn, formatDateForExport, formatNumberForExport } from "@/utils/exportUtils";

export default function SMSCampaigns() {
  const navigate = useNavigate();
  const { effectiveOrgId } = useOrgContext();
  const notify = useNotification();

  const fetchCampaigns = async () => {
    const { data } = await supabase
      .from("sms_bulk_campaigns")
      .select("*")
      .eq("org_id", effectiveOrgId)
      .order("created_at", { ascending: false });
    
    return data || [];
  };

  const { data: campaigns = [], isLoading, refetch } = useQuery({
    queryKey: ['sms-campaigns', effectiveOrgId],
    queryFn: fetchCampaigns,
    enabled: !!effectiveOrgId,
  });

  // Realtime subscription for campaign updates
  useRealtimeSync({
    table: 'sms_bulk_campaigns',
    filter: `org_id=eq.${effectiveOrgId}`,
    enabled: !!effectiveOrgId,
    onUpdate: () => refetch(),
    onInsert: () => refetch(),
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      draft: { variant: "secondary", label: "Draft" },
      processing: { variant: "default", label: "Processing" },
      completed: { variant: "default", label: "Completed" },
      failed: { variant: "destructive", label: "Failed" },
      cancelled: { variant: "outline", label: "Cancelled" },
      scheduled: { variant: "secondary", label: "Scheduled" },
    };
    
    const config = variants[status] || variants.draft;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const handleDelete = async (campaignId: string) => {
    if (!confirm("Are you sure you want to delete this campaign?")) return;

    const { error } = await supabase
      .from("sms_bulk_campaigns")
      .delete()
      .eq("id", campaignId);

    if (error) {
      notify.error("Error", error);
    } else {
      notify.success("Success", "Campaign deleted");
      refetch();
    }
  };

  const getProgress = (campaign: any) => {
    if (campaign.total_recipients === 0) return 0;
    return ((campaign.sent_count + campaign.failed_count) / campaign.total_recipients) * 100;
  };

  const handleExport = () => {
    try {
      const columns: ExportColumn[] = [
        { key: 'campaign_name', label: 'Campaign Name' },
        { key: 'status', label: 'Status' },
        { key: 'total_recipients', label: 'Total Recipients' },
        { key: 'sent_count', label: 'Sent' },
        { key: 'failed_count', label: 'Failed' },
        { key: 'pending_count', label: 'Pending' },
        { key: 'created_at', label: 'Created', format: formatDateForExport },
        { 
          key: 'progress', 
          label: 'Progress (%)',
          format: (value: any, row: any) => {
            const progress = getProgress(row);
            return formatNumberForExport(progress, 1);
          }
        },
      ];

      exportToCSV(campaigns, columns, `sms-campaigns-${new Date().toISOString().split('T')[0]}`);
      
      notify.success("Success", "Campaigns exported successfully");
    } catch (error) {
      notify.error("Error", "Failed to export campaigns");
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">SMS Campaigns</h1>
          <p className="text-muted-foreground">Manage your bulk SMS campaigns</p>
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
          <Button onClick={() => navigate("/bulk-sms")}>
            <Plus className="mr-2 h-4 w-4" />
            New Campaign
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="py-2 text-xs">Campaign Name</TableHead>
              <TableHead className="py-2 text-xs">Status</TableHead>
              <TableHead className="py-2 text-xs">Progress</TableHead>
              <TableHead className="py-2 text-xs">Sent</TableHead>
              <TableHead className="py-2 text-xs">Failed</TableHead>
              <TableHead className="py-2 text-xs">Pending</TableHead>
              <TableHead className="py-2 text-xs">Created</TableHead>
              <TableHead className="py-2 text-xs">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-1.5 text-center text-xs">Loading...</TableCell>
              </TableRow>
            ) : campaigns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-1.5 text-center text-xs">
                  No campaigns yet. Create your first one!
                </TableCell>
              </TableRow>
            ) : (
              campaigns.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell className="py-1.5 font-medium text-xs">{campaign.campaign_name}</TableCell>
                  <TableCell className="py-1.5">{getStatusBadge(campaign.status)}</TableCell>
                  <TableCell className="py-1.5">
                    <div className="space-y-1">
                      <Progress value={getProgress(campaign)} className="h-2" />
                      <span className="text-xs text-muted-foreground">
                        {Math.round(getProgress(campaign))}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-1.5 text-xs text-green-600">{campaign.sent_count}</TableCell>
                  <TableCell className="py-1.5 text-xs text-red-600">{campaign.failed_count}</TableCell>
                  <TableCell className="py-1.5 text-xs text-yellow-600">{campaign.pending_count}</TableCell>
                  <TableCell className="py-1.5 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(campaign.created_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="py-1.5">
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => navigate(`/sms-campaigns/${campaign.id}`)}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleDelete(campaign.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}