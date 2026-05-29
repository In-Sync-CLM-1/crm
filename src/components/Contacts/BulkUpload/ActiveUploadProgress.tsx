import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle, XCircle, AlertCircle } from "lucide-react";

interface ActiveUploadProgressProps {
  orgId: string;
}

export function ActiveUploadProgress({ orgId }: ActiveUploadProgressProps) {
  const { data: activeJob } = useQuery({
    queryKey: ['active-import-job', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('import_jobs')
        .select('*')
        .eq('org_id', orgId)
        .eq('import_type', 'contacts')
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    refetchInterval: 2000, // Poll every 2 seconds
  });

  if (!activeJob) return null;

  const progress = activeJob.total_rows > 0 
    ? Math.round(((activeJob.success_count || 0) + (activeJob.error_count || 0)) / activeJob.total_rows * 100)
    : 0;

  const getStatusIcon = () => {
    switch (activeJob.status) {
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'cancelled':
        return <AlertCircle className="h-4 w-4 text-orange-600" />;
      default:
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    }
  };

  const getStageLabel = () => {
    const stages: Record<string, string> = {
      uploaded: 'Uploaded',
      downloading: 'Downloading file',
      parsing: 'Parsing CSV',
      processing: 'Importing contacts',
      cleanup: 'Cleaning up',
      completed: 'Completed',
      failed: 'Failed',
      cancelled: 'Cancelled'
    };
    return stages[activeJob.current_stage || 'pending'] || 'Processing';
  };

  return (
    <Card className="mb-6 border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <CardTitle className="text-base">
            {activeJob.status === 'processing' ? 'Upload in Progress' : 'Upload Status'}
          </CardTitle>
        </div>
        <CardDescription>{activeJob.file_name}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{getStageLabel()}</span>
            <span className="font-medium">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <div className="grid grid-cols-3 gap-4 pt-2 text-sm">
          <div>
            <p className="text-muted-foreground">Total</p>
            <p className="font-medium">{activeJob.total_rows || 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Imported</p>
            <p className="font-medium text-green-600">{activeJob.success_count || 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Failed</p>
            <p className="font-medium text-destructive">{activeJob.error_count || 0}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
