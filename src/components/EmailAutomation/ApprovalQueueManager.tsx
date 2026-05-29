import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  CheckCircle, XCircle, Clock, AlertCircle, 
  User, Mail, Calendar 
} from "lucide-react";
import { useOrgContext } from "@/hooks/useOrgContext";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ApprovalQueueManager() {
  const { effectiveOrgId } = useOrgContext();
  const queryClient = useQueryClient();
  const [reviewingApproval, setReviewingApproval] = useState<any>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const { data: pendingApprovals, isLoading } = useQuery({
    queryKey: ['automation-approvals', effectiveOrgId, 'pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('automation_approvals')
        .select(`
          *,
          rule:email_automation_rules(name, trigger_type),
          execution:email_automation_executions(
            email_subject,
            contact:contacts(first_name, last_name, email)
          )
        `)
        .eq('org_id', effectiveOrgId)
        .eq('status', 'pending')
        .order('requested_at', { ascending: true });
      
      if (error) throw error;

      // Manually fetch related data
      const approvals = await Promise.all((data || []).map(async (approval) => {
        const [ruleResult, executionResult] = await Promise.all([
          supabase
            .from('email_automation_rules')
            .select('name, trigger_type')
            .eq('id', approval.rule_id)
            .single(),
          supabase
            .from('email_automation_executions')
            .select('email_subject, contact_id')
            .eq('id', approval.execution_id)
            .single(),
        ]);

        let contact = null;
        if (executionResult.data?.contact_id) {
          const contactResult = await supabase
            .from('contacts')
            .select('first_name, last_name, email')
            .eq('id', executionResult.data.contact_id)
            .single();
          contact = contactResult.data;
        }

        return {
          ...approval,
          rule: ruleResult.data,
          execution: {
            ...executionResult.data,
            contact,
          },
        };
      }));

      return approvals;
    },
    enabled: !!effectiveOrgId,
  });

  const { data: recentApprovals } = useQuery({
    queryKey: ['automation-approvals', effectiveOrgId, 'recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('automation_approvals')
        .select('*')
        .eq('org_id', effectiveOrgId)
        .in('status', ['approved', 'rejected'])
        .order('reviewed_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;

      // Fetch rule names
      const approvals = await Promise.all((data || []).map(async (approval) => {
        const ruleResult = await supabase
          .from('email_automation_rules')
          .select('name')
          .eq('id', approval.rule_id)
          .single();

        let reviewer = null;
        if (approval.reviewed_by) {
          const reviewerResult = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', approval.reviewed_by)
            .single();
          reviewer = reviewerResult.data;
        }

        return {
          ...approval,
          rule: ruleResult.data,
          reviewer,
        };
      }));

      return approvals;
    },
    enabled: !!effectiveOrgId,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ 
      approvalId, 
      status, 
      notes 
    }: { 
      approvalId: string; 
      status: 'approved' | 'rejected'; 
      notes: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Update approval
      const { error: approvalError } = await supabase
        .from('automation_approvals')
        .update({
          status,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          approval_notes: notes,
          rejection_reason: status === 'rejected' ? notes : null,
        })
        .eq('id', approvalId);

      if (approvalError) throw approvalError;

      // If approved, update execution to scheduled
      if (status === 'approved') {
        const approval = pendingApprovals?.find(a => a.id === approvalId);
        if (approval) {
          const { error: execError } = await supabase
            .from('email_automation_executions')
            .update({ 
              status: 'scheduled',
              scheduled_for: new Date().toISOString() 
            })
            .eq('id', approval.execution_id);

          if (execError) throw execError;
        }
      } else {
        // If rejected, mark execution as failed
        const approval = pendingApprovals?.find(a => a.id === approvalId);
        if (approval) {
          const { error: execError } = await supabase
            .from('email_automation_executions')
            .update({ 
              status: 'failed',
              error_message: `Rejected by admin: ${notes}` 
            })
            .eq('id', approval.execution_id);

          if (execError) throw execError;
        }
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['automation-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['email-automation-executions'] });
      toast.success(
        variables.status === 'approved' 
          ? 'Automation approved and scheduled' 
          : 'Automation rejected'
      );
      setReviewingApproval(null);
      setReviewNotes("");
    },
    onError: (error: Error) => {
      toast.error('Failed to review approval: ' + error.message);
    },
  });

  const handleReview = (approval: any) => {
    setReviewingApproval(approval);
    setReviewNotes("");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Pending Approvals
          </CardTitle>
          <CardDescription>
            Review automation emails that require approval before sending
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading approvals...
            </div>
          ) : pendingApprovals && pendingApprovals.length > 0 ? (
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {pendingApprovals.map((approval) => (
                  <Card key={approval.id} className="border-warning">
                    <CardContent className="pt-6">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">
                                {approval.rule?.trigger_type}
                              </Badge>
                              <span className="font-medium">
                                {approval.rule?.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              {approval.execution?.email_subject}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <User className="h-3 w-3" />
                              To: {approval.execution?.contact?.first_name}{' '}
                              {approval.execution?.contact?.last_name} ({approval.execution?.contact?.email})
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              Requested {formatDistanceToNow(new Date(approval.requested_at), { addSuffix: true })}
                            </div>
                          </div>
                          <Badge variant="secondary">Pending</Badge>
                        </div>

                        {approval.expires_at && (
                          <div className="flex items-center gap-2 text-sm text-warning">
                            <AlertCircle className="h-3 w-3" />
                            Expires {formatDistanceToNow(new Date(approval.expires_at), { addSuffix: true })}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => handleReview(approval)}
                          >
                            Review
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>No pending approvals</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Reviews</CardTitle>
          <CardDescription>
            Recently approved or rejected automations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentApprovals && recentApprovals.length > 0 ? (
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {recentApprovals.map((approval) => (
                  <div 
                    key={approval.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      {approval.status === 'approved' ? (
                        <CheckCircle className="h-4 w-4 text-success" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      <div>
                        <div className="font-medium text-sm">
                          {approval.rule?.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Reviewed by {approval.reviewer?.first_name || 'Unknown'}{' '}
                          {approval.reviewer?.last_name || ''}{' '}
                          {formatDistanceToNow(new Date(approval.reviewed_at), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                    <Badge variant={approval.status === 'approved' ? 'default' : 'destructive'}>
                      {approval.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>No recent reviews</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!reviewingApproval} onOpenChange={(open) => {
        if (!open) {
          setReviewingApproval(null);
          setReviewNotes("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Automation</DialogTitle>
            <DialogDescription>
              Approve or reject this automation email
            </DialogDescription>
          </DialogHeader>

          {reviewingApproval && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="font-medium">Rule:</span> {reviewingApproval.rule?.name}
                </div>
                <div className="text-sm">
                  <span className="font-medium">Subject:</span>{' '}
                  {reviewingApproval.execution?.email_subject}
                </div>
                <div className="text-sm">
                  <span className="font-medium">Recipient:</span>{' '}
                  {reviewingApproval.execution?.contact?.first_name}{' '}
                  {reviewingApproval.execution?.contact?.last_name} ({reviewingApproval.execution?.contact?.email})
                </div>
              </div>

              <div className="space-y-2">
                <Label>Review Notes</Label>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Optional notes about this decision..."
                  rows={3}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    reviewMutation.mutate({
                      approvalId: reviewingApproval.id,
                      status: 'rejected',
                      notes: reviewNotes || 'No reason provided',
                    });
                  }}
                  disabled={reviewMutation.isPending}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    reviewMutation.mutate({
                      approvalId: reviewingApproval.id,
                      status: 'approved',
                      notes: reviewNotes || 'Approved',
                    });
                  }}
                  disabled={reviewMutation.isPending}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Approve & Send
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
