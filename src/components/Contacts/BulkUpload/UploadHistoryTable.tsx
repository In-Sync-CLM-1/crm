import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, RotateCcw, Eye, Loader2, X } from "lucide-react";
import { format } from "date-fns";
import { useNotification } from "@/hooks/useNotification";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

interface UploadHistoryTableProps {
  orgId: string;
}

export function UploadHistoryTable({ orgId }: UploadHistoryTableProps) {
  const [revertJobId, setRevertJobId] = useState<string | null>(null);
  const [cancelJobId, setCancelJobId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const notification = useNotification();

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['import-jobs', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('import_jobs')
        .select('*')
        .eq('org_id', orgId)
        .eq('import_type', 'contacts')
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) throw error;
      return data;
    },
    refetchInterval: 5000, // Poll every 5 seconds for status updates
  });

  const revertMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase.functions.invoke('rollback-bulk-import', {
        body: { importJobId: jobId }
      });
      if (error) throw error;
    },
    onSuccess: () => {
      notification.success("Revert completed", "All contacts from this upload have been removed");
      queryClient.invalidateQueries({ queryKey: ['import-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setRevertJobId(null);
    },
    onError: (error: any) => {
      notification.error("Revert failed", error.message);
    }
  });

  const cancelMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase
        .from('import_jobs')
        .update({ 
          status: 'cancelled',
          current_stage: 'cancelled'
        })
        .eq('id', jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      notification.success("Upload cancelled", "The import process has been stopped");
      queryClient.invalidateQueries({ queryKey: ['import-jobs'] });
      setCancelJobId(null);
    },
    onError: (error: any) => {
      notification.error("Cancel failed", error.message);
    }
  });

  const downloadErrorFile = (job: any) => {
    if (!job.error_details || !Array.isArray(job.error_details)) {
      notification.error("No errors", "This upload has no errors to download");
      return;
    }

    const errorLines = ['Row,Field,Error'];
    job.error_details.forEach((err: any) => {
      errorLines.push(`${err.row || 'N/A'},"${err.field || 'N/A'}","${err.message || 'Unknown error'}"`);
    });

    const blob = new Blob([errorLines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${job.file_name}-errors.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      pending: { variant: "secondary", label: "Pending" },
      processing: { variant: "default", label: "Processing" },
      completed: { variant: "default", label: "Completed" },
      failed: { variant: "destructive", label: "Failed" },
      cancelled: { variant: "secondary", label: "Cancelled" },
      rolled_back: { variant: "secondary", label: "Reverted" }
    };
    const config = variants[status] || { variant: "secondary", label: status };
    return <Badge variant={config.variant as any}>{config.label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No upload history available
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Records</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="font-medium">{job.file_name}</TableCell>
                <TableCell>{getStatusBadge(job.status)}</TableCell>
                <TableCell>
                  <div className="text-sm">
                    <div className="text-green-600">{job.success_count || 0} imported</div>
                    {job.error_count > 0 && (
                      <div className="text-destructive">{job.error_count} failed</div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(job.created_at), 'MMM d, yyyy HH:mm')}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {(job.status === 'processing' || job.status === 'pending') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCancelJobId(job.id)}
                        disabled={cancelMutation.isPending}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    
                    {job.error_count > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => downloadErrorFile(job)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    
                    {job.status === 'completed' && job.success_count > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRevertJobId(job.id)}
                        disabled={revertMutation.isPending}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={revertJobId !== null}
        onOpenChange={(open) => !open && setRevertJobId(null)}
        title="Revert Upload"
        description="This will permanently delete all contacts imported in this upload. This action cannot be undone."
        onConfirm={() => revertJobId && revertMutation.mutate(revertJobId)}
        confirmText="Revert Upload"
        variant="destructive"
      />

      <ConfirmDialog
        open={cancelJobId !== null}
        onOpenChange={(open) => !open && setCancelJobId(null)}
        title="Cancel Upload"
        description="This will stop the import process. Already imported contacts will not be removed."
        onConfirm={() => cancelJobId && cancelMutation.mutate(cancelJobId)}
        confirmText="Cancel Upload"
      />
    </>
  );
}
