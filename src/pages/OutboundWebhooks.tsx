import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useNotification } from "@/hooks/useNotification";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  Webhook,
  Trash2,
  TestTube2,
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  Edit,
  Database,
} from "lucide-react";
import { OutboundWebhookDialog } from "@/components/OutboundWebhooks/OutboundWebhookDialog";
import { OutboundWebhookLogs } from "@/components/OutboundWebhooks/OutboundWebhookLogs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const OutboundWebhooks = () => {
  const { effectiveOrgId } = useOrgContext();
  const notify = useNotification();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [webhookToDelete, setWebhookToDelete] = useState<string | null>(null);
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  const [selectedWebhookForLogs, setSelectedWebhookForLogs] = useState<string | null>(null);

  // Fetch webhooks
  const { data: webhooks = [], isLoading } = useQuery({
    queryKey: ["outbound-webhooks", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("outbound_webhooks")
        .select("*")
        .eq("org_id", effectiveOrgId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId,
  });

  // Toggle webhook active status
  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("outbound_webhooks")
        .update({ is_active })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outbound-webhooks"] });
      notify.success("Webhook status updated");
    },
    onError: (error: any) => {
      notify.error(`Failed to update webhook: ${error.message}`);
    },
  });

  // Delete webhook
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("outbound_webhooks")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outbound-webhooks"] });
      notify.success("Webhook deleted");
      setDeleteDialogOpen(false);
      setWebhookToDelete(null);
    },
    onError: (error: any) => {
      notify.error(`Failed to delete webhook: ${error.message}`);
    },
  });

  // Test webhook
  const testMutation = useMutation({
    mutationFn: async (webhookId: string) => {
      const { data, error } = await supabase.functions.invoke("outbound-webhook-handler", {
        body: {
          webhookId,
          orgId: effectiveOrgId,
          triggerEvent: "test",
          triggerData: {
            test: true,
            timestamp: new Date().toISOString(),
            message: "This is a test webhook payload",
          },
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      notify.success("Test webhook sent successfully");
    },
    onError: (error: any) => {
      notify.error(`Failed to send test webhook: ${error.message}`);
    },
  });

  const handleEdit = (webhook: any) => {
    setSelectedWebhook(webhook);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setSelectedWebhook(null);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setWebhookToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleViewLogs = (webhookId: string) => {
    setSelectedWebhookForLogs(webhookId);
    setLogsDialogOpen(true);
  };

  const getTriggerEventLabel = (event: string) => {
    const labels: Record<string, string> = {
      contact_created: "Contact Created",
      contact_updated: "Contact Updated",
      stage_changed: "Stage Changed",
      activity_logged: "Activity Logged",
      disposition_set: "Disposition Set",
      assignment_changed: "Assignment Changed",
      support_tickets_created: "Ticket Created",
      support_tickets_updated: "Ticket Updated",
      support_tickets_deleted: "Ticket Deleted",
      support_ticket_comments_created: "Ticket Comment Added",
      support_ticket_comments_updated: "Ticket Comment Updated",
      support_ticket_history_created: "Ticket History Logged",
      support_ticket_escalations_created: "Ticket Escalated",
    };
    return labels[event] || event;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Outbound Webhooks</h1>
            <p className="text-muted-foreground mt-1">
              Send real-time data to external systems when events occur in your CRM
            </p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Create Webhook
          </Button>
        </div>

        {/* Webhooks List */}
        {isLoading ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">Loading webhooks...</p>
          </Card>
        ) : webhooks.length === 0 ? (
          <Card className="p-12 text-center">
            <Webhook className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No webhooks configured</h3>
            <p className="text-muted-foreground mb-6">
              Create your first outbound webhook to start sending data to external systems
            </p>
            <Button onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Create Webhook
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4">
            {webhooks.map((webhook: any) => (
              <Card key={webhook.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold">{webhook.name}</h3>
                      <Badge variant={webhook.is_active ? "default" : "secondary"}>
                        {webhook.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant="outline">{webhook.http_method}</Badge>
                    </div>

                    {webhook.description && (
                      <p className="text-sm text-muted-foreground mb-3">
                        {webhook.description}
                      </p>
                    )}

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Webhook className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">URL:</span>
                        <code className="px-2 py-1 bg-muted rounded text-xs">
                          {webhook.webhook_url}
                        </code>
                      </div>

                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Table:</span>
                        <Badge variant="outline">{webhook.target_table || 'contacts'}</Badge>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Operation:</span>
                        <Badge variant="outline">
                          {webhook.target_operation === 'INSERT' && 'Create'}
                          {webhook.target_operation === 'UPDATE' && 'Update'}
                          {webhook.target_operation === 'DELETE' && 'Delete'}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                          {webhook.total_executions || 0} executions
                        </div>
                        <div className="flex items-center gap-1">
                          <XCircle className="h-3 w-3 text-red-500" />
                          {webhook.total_failures || 0} failures
                        </div>
                        {webhook.last_executed_at && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Last: {new Date(webhook.last_executed_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={webhook.is_active}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ id: webhook.id, is_active: checked })
                      }
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testMutation.mutate(webhook.id)}
                      disabled={!webhook.is_active}
                    >
                      <TestTube2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewLogs(webhook.id)}
                    >
                      <Activity className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(webhook)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(webhook.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <OutboundWebhookDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          webhook={selectedWebhook}
        />

        {/* Logs Dialog */}
        {selectedWebhookForLogs && (
          <OutboundWebhookLogs
            open={logsDialogOpen}
            onOpenChange={setLogsDialogOpen}
            webhookId={selectedWebhookForLogs}
          />
        )}

        {/* Delete Confirmation */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Webhook</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this webhook? This action cannot be undone.
                All execution logs will also be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => webhookToDelete && deleteMutation.mutate(webhookToDelete)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
};

export default OutboundWebhooks;
