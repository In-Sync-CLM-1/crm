import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const DesignationPermissions = () => {
  const queryClient = useQueryClient();
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  const { data: organizations } = useQuery({
    queryKey: ["organizations-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: designations } = useQuery({
    queryKey: ["designations", selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return [];
      const { data, error } = await supabase
        .from("designations")
        .select("*")
        .eq("org_id", selectedOrgId)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedOrgId,
  });

  const { data: features } = useQuery({
    queryKey: ["feature-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_permissions")
        .select("*")
        .order("category, feature_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: permissions, isLoading: permissionsLoading } = useQuery({
    queryKey: ["designation-permissions-all", selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return [];
      const { data, error } = await supabase
        .from("designation_feature_access")
        .select("*")
        .eq("org_id", selectedOrgId);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedOrgId,
  });

  const updatePermissionMutation = useMutation({
    mutationFn: async ({
      designationId,
      featureKey,
      permission,
      value,
    }: {
      designationId: string;
      featureKey: string;
      permission: 'can_view' | 'can_create' | 'can_edit' | 'can_delete';
      value: boolean;
    }) => {
      const existing = permissions?.find(
        p => p.designation_id === designationId && p.feature_key === featureKey
      );

      if (existing) {
        const { error } = await supabase
          .from("designation_feature_access")
          .update({ [permission]: value })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("designation_feature_access")
          .insert({
            designation_id: designationId,
            org_id: selectedOrgId,
            feature_key: featureKey,
            [permission]: value,
          });
        if (error) throw error;
      }

      // Log audit
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("platform_admin_audit_log").insert({
        admin_id: user?.id,
        target_org_id: selectedOrgId,
        action: 'update_designation_permissions',
        details: { designation_id: designationId, feature_key: featureKey, permission, value },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["designation-permissions-all", selectedOrgId] });
      toast.success("Permission updated");
    },
    onError: (error: any) => {
      toast.error(`Failed to update permission: ${error.message}`);
    },
  });

  const getPermissionValue = (
    designationId: string,
    featureKey: string,
    permission: 'can_view' | 'can_create' | 'can_edit' | 'can_delete'
  ): boolean => {
    const perm = permissions?.find(
      p => p.designation_id === designationId && p.feature_key === featureKey
    );
    return perm?.[permission] ?? true;
  };

  if (!selectedOrgId) {
    return (
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">Select Organization</label>
          <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose an organization" />
            </SelectTrigger>
            <SelectContent>
              {organizations?.map(org => (
                <SelectItem key={org.id} value={org.id}>
                  {org.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  if (permissionsLoading) {
    return <Loader2 className="h-8 w-8 animate-spin mx-auto" />;
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium mb-2 block">Organization</label>
        <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {organizations?.map(org => (
              <SelectItem key={org.id} value={org.id}>
                {org.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Accordion type="single" collapsible className="w-full">
        {designations?.map(designation => (
          <AccordionItem key={designation.id} value={designation.id}>
            <AccordionTrigger className="text-left">
              <div className="flex items-center gap-2">
                <span className="font-medium">{designation.name}</span>
                <span className="text-xs text-muted-foreground">({designation.role})</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="rounded-md border mt-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Feature</TableHead>
                      <TableHead className="text-center">View</TableHead>
                      <TableHead className="text-center">Create</TableHead>
                      <TableHead className="text-center">Edit</TableHead>
                      <TableHead className="text-center">Delete</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {features?.map(feature => (
                      <TableRow key={feature.feature_key}>
                        <TableCell className="font-medium">{feature.feature_name}</TableCell>
                        {(['can_view', 'can_create', 'can_edit', 'can_delete'] as const).map(perm => (
                          <TableCell key={perm} className="text-center">
                            <Checkbox
                              checked={getPermissionValue(designation.id, feature.feature_key, perm)}
                              onCheckedChange={(checked) =>
                                updatePermissionMutation.mutate({
                                  designationId: designation.id,
                                  featureKey: feature.feature_key,
                                  permission: perm,
                                  value: checked as boolean,
                                })
                              }
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};
