import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useNotification } from "@/hooks/useNotification";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { Loader2, ArrowLeft, Mail, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { format } from "date-fns";

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
  started_at: string;
  completed_at: string;
}

interface Recipient {
  id: string;
  email: string;
  status: string;
  error_message: string;
  sent_at: string;
  contact_id: string;
  delivered_at: string;
  bounced_at: string;
  bounce_reason: string;
  opened_at: string;
  open_count: number;
  first_clicked_at: string;
  click_count: number;
  complained_at: string;
  contacts: {
    first_name: string;
    last_name: string;
  };
}

const EmailCampaignDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotification();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCampaignDetails = async () => {
    try {
      const { data, error } = await supabase
        .from("email_bulk_campaigns")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setCampaign(data);
    } catch (error: any) {
      console.error("Error fetching campaign:", error);
      notify.error("Error", "Failed to load campaign details");
    } finally {
      setLoading(false);
    }
  };

  const fetchRecipients = async () => {
    try {
      const { data, error } = await supabase
        .from("email_campaign_recipients")
        .select(`
          *,
          contacts (
            first_name,
            last_name
          )
        `)
        .eq("campaign_id", id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRecipients(data || []);
    } catch (error: any) {
      console.error("Error fetching recipients:", error);
    }
  };

  useEffect(() => {
    fetchCampaignDetails();
    fetchRecipients();
  }, [id]);

  useRealtimeSync({
    table: 'email_bulk_campaigns',
    filter: `id=eq.${id}`,
    onUpdate: fetchCampaignDetails,
    enabled: !!id,
  });

  useRealtimeSync({
    table: 'email_campaign_recipients',
    filter: `campaign_id=eq.${id}`,
    onUpdate: fetchRecipients,
    enabled: !!id,
  });

  const getStatusBadge = (recipient: Recipient) => {
    // Determine the most relevant status to show
    let displayStatus = recipient.status;
    let variant: any = "secondary";
    let Icon = Clock;
    
    if (recipient.complained_at) {
      displayStatus = "complained";
      variant = "destructive";
      Icon = AlertCircle;
    } else if (recipient.bounced_at) {
      displayStatus = "bounced";
      variant = "destructive";
      Icon = AlertCircle;
    } else if (recipient.click_count > 0) {
      displayStatus = "clicked";
      variant = "default";
      Icon = CheckCircle2;
    } else if (recipient.open_count > 0) {
      displayStatus = "opened";
      variant = "default";
      Icon = CheckCircle2;
    } else if (recipient.delivered_at) {
      displayStatus = "delivered";
      variant = "default";
      Icon = CheckCircle2;
    } else if (recipient.status === "sent") {
      displayStatus = "sent";
      variant = "default";
      Icon = Mail;
    } else if (recipient.status === "failed") {
      displayStatus = "failed";
      variant = "destructive";
      Icon = AlertCircle;
    }

    return (
      <Badge variant={variant} className="flex items-center gap-1 w-fit">
        <Icon className="h-3 w-3" />
        {displayStatus}
      </Badge>
    );
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-muted",
      sending: "bg-primary",
      completed: "bg-green-500",
      failed: "bg-destructive",
    };
    return colors[status] || "bg-muted";
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!campaign) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Campaign not found</p>
          <Button onClick={() => navigate("/bulk-email")} className="mt-4">
            Go Back
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const progressPercentage = campaign.total_recipients > 0
    ? ((campaign.sent_count + campaign.failed_count) / campaign.total_recipients) * 100
    : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{campaign.name}</h1>
              <p className="text-muted-foreground">Campaign Details</p>
            </div>
          </div>
          <Badge className={getStatusColor(campaign.status)}>
            {campaign.status}
          </Badge>
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Recipients</CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{campaign.total_recipients}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sent</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{campaign.sent_count}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{campaign.pending_count}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
              <AlertCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{campaign.failed_count}</div>
            </CardContent>
          </Card>
        </div>

        {/* Progress */}
        <Card>
          <CardHeader>
            <CardTitle>Campaign Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={progressPercentage} />
            <p className="text-sm text-muted-foreground">
              {Math.round(progressPercentage)}% complete
            </p>
          </CardContent>
        </Card>

        {/* Campaign Info */}
        <Card>
          <CardHeader>
            <CardTitle>Campaign Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium">Subject</p>
                <p className="text-muted-foreground">{campaign.subject}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Created</p>
                <p className="text-muted-foreground">
                  {format(new Date(campaign.created_at), "PPp")}
                </p>
              </div>
              {campaign.started_at && (
                <div>
                  <p className="text-sm font-medium">Started</p>
                  <p className="text-muted-foreground">
                    {format(new Date(campaign.started_at), "PPp")}
                  </p>
                </div>
              )}
              {campaign.completed_at && (
                <div>
                  <p className="text-sm font-medium">Completed</p>
                  <p className="text-muted-foreground">
                    {format(new Date(campaign.completed_at), "PPp")}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recipients List */}
        <Card>
          <CardHeader>
            <CardTitle>Recipients ({recipients.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Engagement</TableHead>
              <TableHead>Sent At</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map((recipient) => (
                  <TableRow key={recipient.id}>
                    <TableCell>
                      {recipient.contacts?.first_name} {recipient.contacts?.last_name}
                    </TableCell>
                    <TableCell>{recipient.email}</TableCell>
                    <TableCell>{getStatusBadge(recipient)}</TableCell>
                    <TableCell>
                      {recipient.sent_at
                        ? format(new Date(recipient.sent_at), "PPp")
                        : "-"}
                    </TableCell>
                    <TableCell className="text-xs text-destructive">
                      {recipient.error_message || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default EmailCampaignDetail;
