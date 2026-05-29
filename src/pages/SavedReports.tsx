import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Eye, Trash2, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { reportDataSources } from "@/config/reportDataSources";
import { useNotification } from "@/hooks/useNotification";

export default function SavedReports() {
  const { effectiveOrgId } = useOrgContext();
  const navigate = useNavigate();
  const notify = useNotification();

  const { data: reports, isLoading, refetch } = useQuery({
    queryKey: ['saved-reports', effectiveOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('saved_reports')
        .select('*')
        .eq('org_id', effectiveOrgId!)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId,
  });

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('saved_reports')
        .delete()
        .eq('id', id);

      if (error) throw error;

      notify.success("Report deleted", "The report has been deleted successfully");

      refetch();
    } catch (error: any) {
      notify.error("Error", error);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Saved Reports</h1>
            <p className="text-muted-foreground">View and manage your saved reports</p>
          </div>
          <Button onClick={() => navigate('/reports/builder')}>
            <FileText className="h-4 w-4 mr-2" />
            Create New Report
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-full" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : reports && reports.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports.map((report) => {
              const dataSourceLabel = reportDataSources[report.data_source as keyof typeof reportDataSources]?.label || report.data_source;
              
              return (
                <Card key={report.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{report.name}</CardTitle>
                        <CardDescription className="mt-1">
                          {report.description || 'No description'}
                        </CardDescription>
                      </div>
                      {report.is_public && (
                        <Badge variant="secondary" className="ml-2">
                          <Users className="h-3 w-3 mr-1" />
                          Shared
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Data Source:</span>
                      <Badge variant="outline">{dataSourceLabel}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Created {format(new Date(report.created_at), 'MMM d, yyyy')}
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => navigate(`/reports/view/${report.id}`)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(report.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12">
              <div className="text-center space-y-4">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
                <div>
                  <h3 className="text-lg font-semibold mb-2">No saved reports yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Create your first report to get started with analytics
                  </p>
                  <Button onClick={() => navigate('/reports/builder')}>
                    Create Report
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
