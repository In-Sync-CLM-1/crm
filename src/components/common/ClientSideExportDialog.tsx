import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useNotification } from "@/hooks/useNotification";
import { exportToCSV, ExportColumn, formatDateForExport } from "@/utils/exportUtils";

const EXPORT_BATCH_SIZE = 1000;

interface ClientSideExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  tableName: string;
  columns: ExportColumn[];
  title?: string;
  fileName?: string;
}

export function ClientSideExportDialog({
  open,
  onOpenChange,
  orgId,
  tableName,
  columns,
  title = "Export Data",
  fileName = "export"
}: ClientSideExportDialogProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [exportStage, setExportStage] = useState("");
  const [recordCount, setRecordCount] = useState<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const notification = useNotification();

  const handleExport = async () => {
    setIsExporting(true);
    setProgress(0);
    setExportStage("Counting records...");
    abortControllerRef.current = new AbortController();

    try {
      // Get total count using RPC or direct query
      const { count: totalCount, error: countErr } = await supabase
        .from(tableName as any)
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId);
      
      if (countErr) throw countErr;
      if (!totalCount || totalCount === 0) {
        notification.info("No data", "No records found to export");
        setIsExporting(false);
        return;
      }

      setRecordCount(totalCount);
      const totalBatches = Math.ceil(totalCount / EXPORT_BATCH_SIZE);
      
      setExportStage(`Fetching ${totalCount.toLocaleString()} records...`);

      let allData: any[] = [];

      for (let batch = 0; batch < totalBatches; batch++) {
        if (abortControllerRef.current?.signal.aborted) {
          throw new Error('Export cancelled');
        }

        const offset = batch * EXPORT_BATCH_SIZE;
        
        const { data, error } = await supabase
          .from(tableName as any)
          .select('*')
          .eq('org_id', orgId)
          .range(offset, offset + EXPORT_BATCH_SIZE - 1)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        if (data) allData = allData.concat(data);

        setProgress(Math.round(((batch + 1) / totalBatches) * 90));
        setExportStage(`Fetched ${allData.length.toLocaleString()} of ${totalCount.toLocaleString()} records...`);
      }

      setProgress(95);
      setExportStage("Generating CSV file...");

      const formattedColumns = columns.map(col => {
        if (col.key === 'created_at' || col.key === 'updated_at') {
          return { ...col, format: (value: any) => formatDateForExport(value) };
        }
        return col;
      });

      const timestamp = new Date().toISOString().slice(0, 10);
      exportToCSV(allData, formattedColumns, `${fileName}-${timestamp}`);

      setProgress(100);
      notification.success("Export complete", `Exported ${allData.length.toLocaleString()} records`);
      
      setTimeout(() => handleClose(), 1000);

    } catch (error: any) {
      if (error.message === 'Export cancelled') {
        notification.info("Export cancelled", "The export was cancelled");
      } else {
        notification.error("Export failed", error.message);
      }
    } finally {
      setIsExporting(false);
      setProgress(0);
      setExportStage("");
    }
  };

  const handleCancel = () => abortControllerRef.current?.abort();

  const handleClose = () => {
    if (!isExporting) {
      setRecordCount(null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Export your data to a CSV file.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isExporting ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <div className="text-center">
                  <p className="font-medium">{exportStage}</p>
                  {recordCount && <p className="text-sm text-muted-foreground">Total: {recordCount.toLocaleString()} records</p>}
                </div>
              </div>
              <Progress value={progress} className="w-full" />
              <div className="flex justify-center">
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  <X className="h-4 w-4 mr-2" />Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg text-sm">
                <p className="font-medium mb-2">Export includes:</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  {columns.slice(0, 5).map(col => <li key={col.key}>{col.label}</li>)}
                  {columns.length > 5 && <li>...and {columns.length - 5} more columns</li>}
                </ul>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleClose}>Cancel</Button>
                <Button onClick={handleExport}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
