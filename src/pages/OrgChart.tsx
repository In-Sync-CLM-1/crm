import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Users, Building2 } from "lucide-react";

interface Designation {
  id: string;
  name: string;
  description: string;
  role: string;
  org_id: string;
}

interface HierarchyNode extends Designation {
  reports_to?: string | null;
  direct_reports: HierarchyNode[];
  employee_count: number;
}

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  designation_id: string;
}

export default function OrgChart() {
  // Fetch org chart data with React Query
  const { data, isLoading: loading } = useQuery({
    queryKey: ['org-chart'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();

      if (!profile?.org_id) throw new Error("No org found");

      // Fetch all designations
      const { data: designations, error: designationsError } = await supabase
        .from("designations" as any)
        .select("*")
        .eq("org_id", profile.org_id);

      if (designationsError) throw designationsError;

      // Fetch reporting hierarchy
      const { data: hierarchy, error: hierarchyError } = await supabase
        .from("reporting_hierarchy" as any)
        .select("*")
        .eq("org_id", profile.org_id);

      if (hierarchyError) throw hierarchyError;

      // Fetch all employees with designations
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, designation_id")
        .eq("org_id", profile.org_id)
        .not("designation_id", "is", null);

      if (profilesError) throw profilesError;

      // Build hierarchy tree
      const designationMap = new Map<string, HierarchyNode>();
      const hierarchyMap = new Map<string, string | null>();

      // Initialize all designations
      (designations as any[]).forEach((des: Designation) => {
        const empCount = (profiles as Profile[]).filter(p => p.designation_id === des.id).length;
        designationMap.set(des.id, {
          ...des,
          reports_to: null,
          direct_reports: [],
          employee_count: empCount,
        });
      });

      // Map reporting relationships
      (hierarchy as any[]).forEach((rel: any) => {
        hierarchyMap.set(rel.designation_id, rel.reports_to_designation_id);
        const node = designationMap.get(rel.designation_id);
        if (node) {
          node.reports_to = rel.reports_to_designation_id;
        }
      });

      // Build tree structure
      const roots: HierarchyNode[] = [];
      designationMap.forEach((node) => {
        if (!node.reports_to) {
          roots.push(node);
        } else {
          const parent = designationMap.get(node.reports_to);
          if (parent) {
            parent.direct_reports.push(node);
          }
        }
      });

      return { hierarchyData: roots, employees: profiles as Profile[] };
    },
    meta: {
      onError: (error: Error) => {
        console.error("Error fetching org chart:", error);
        toast.error("Failed to load organization chart");
      }
    }
  });

  const hierarchyData = data?.hierarchyData || [];
  const employees = data?.employees || [];

  const renderNode = (node: HierarchyNode, level: number = 0) => {
    const employeesInDesignation = employees.filter(e => e.designation_id === node.id);
    const bgColor = level === 0 ? "bg-primary/10 border-primary" : 
                    level === 1 ? "bg-secondary/10 border-secondary" : 
                    "bg-muted border-border";

    return (
      <div key={node.id} className="flex flex-col items-center">
        <Card className={`w-72 ${bgColor} border-2`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              {node.name}
            </CardTitle>
            <CardDescription className="text-sm">
              {node.role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {node.description && (
              <p className="text-sm text-muted-foreground mb-3">{node.description}</p>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4" />
              <span className="font-medium">{node.employee_count} employee{node.employee_count !== 1 ? 's' : ''}</span>
            </div>
            {employeesInDesignation.length > 0 && (
              <div className="mt-3 space-y-1">
                {employeesInDesignation.slice(0, 3).map(emp => (
                  <div key={emp.id} className="text-xs text-muted-foreground">
                    • {emp.first_name} {emp.last_name}
                  </div>
                ))}
                {employeesInDesignation.length > 3 && (
                  <div className="text-xs text-muted-foreground">
                    +{employeesInDesignation.length - 3} more
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {node.direct_reports.length > 0 && (
          <div className="flex flex-col items-center my-4">
            <div className="w-0.5 h-8 bg-border"></div>
            <div className="flex gap-8 items-start">
              {node.direct_reports.map((child) => (
                <div key={child.id} className="flex flex-col items-center">
                  <div className="w-0.5 h-8 bg-border"></div>
                  {renderNode(child, level + 1)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-64">
          <div className="text-lg">Loading organization chart...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Organization Chart</h1>
          <p className="text-muted-foreground">Visual representation of your organizational hierarchy</p>
        </div>

        {hierarchyData.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                No organizational hierarchy configured yet. Set up designations and reporting structure in the Designations page.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-x-auto pb-8">
            <div className="min-w-max flex justify-center p-8">
              {hierarchyData.map(root => renderNode(root))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
