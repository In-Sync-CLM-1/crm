import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useDialogState } from "@/hooks/useDialogState";
import { useNotification } from "@/hooks/useNotification";
import { useOrgData } from "@/hooks/useOrgData";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit, Users } from "lucide-react";
import { FormDialog } from "@/components/common/FormDialog";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

interface Designation {
  id: string;
  name: string;
  description: string;
  role: string;
  is_active: boolean;
  employee_count?: number;
}

interface ReportingRelation {
  id: string;
  designation_id: string;
  reports_to_designation_id: string | null;
}

const ROLES = [
  { value: "sales_rep", label: "Sales Rep" },
  { value: "support_rep", label: "Support Rep" },
  { value: "sales_manager", label: "Sales Manager" },
  { value: "support_manager", label: "Support Manager" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super Admin" },
];

export default function Designations() {
  const { effectiveOrgId } = useOrgContext();
  const notify = useNotification();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const dialog = useDialogState({
    name: "",
    description: "",
    role: "",
    reports_to: "",
  });

  const { data: designations = [], isLoading, refetch } = useOrgData<Designation>("designations", {
    select: "id, name, description, role, is_active",
    orderBy: { column: "name", ascending: true }
  });

  const { data: reporting = [] } = useOrgData<ReportingRelation>("reporting_hierarchy", {
    select: "*"
  });

  const { data: profiles = [] } = useOrgData("profiles", {
    select: "designation_id",
    filter: { designation_id: { not: null } }
  });

  // Calculate employee counts
  const designationsWithCounts = designations.map(des => ({
    ...des,
    employee_count: profiles.filter(p => p.designation_id === des.id).length
  }));


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveOrgId) return;
    
    setIsSubmitting(true);
    try {
      const designationPayload = {
        org_id: effectiveOrgId,
        name: dialog.formData.name,
        description: dialog.formData.description,
        role: dialog.formData.role,
        is_active: true,
      };

      let designationId: string;

      if (dialog.isEditing) {
        const { error } = await supabase
          .from("designations" as any)
          .update(designationPayload)
          .eq("id", dialog.editingItem.id);

        if (error) throw error;
        designationId = dialog.editingItem.id;
      } else {
        const { data, error } = await supabase
          .from("designations" as any)
          .insert(designationPayload)
          .select()
          .single();

        if (error) throw error;
        designationId = (data as any).id;
      }

      // Handle reporting relationship
      if (dialog.formData.reports_to) {
        const { error: hierError } = await supabase
          .from("reporting_hierarchy" as any)
          .upsert({
            org_id: effectiveOrgId,
            designation_id: designationId,
            reports_to_designation_id: dialog.formData.reports_to,
          });

        if (hierError) throw hierError;
      } else if (dialog.isEditing) {
        await supabase
          .from("reporting_hierarchy" as any)
          .delete()
          .eq("designation_id", designationId);
      }

      notify.success(dialog.isEditing ? "Designation updated successfully" : "Designation created successfully");
      dialog.closeDialog();
      refetch();
    } catch (error) {
      notify.error("Failed to save designation", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    try {
      const { error } = await supabase
        .from("designations" as any)
        .delete()
        .eq("id", deleteConfirm);

      if (error) throw error;
      notify.success("Designation deleted successfully");
      refetch();
    } catch (error) {
      notify.error("Failed to delete designation", error);
    } finally {
      setDeleteConfirm(null);
    }
  };

  const handleEdit = (designation: Designation) => {
    const reportsTo = reporting.find(r => r.designation_id === designation.id);
    dialog.openDialog({
      ...designation,
      reports_to: reportsTo?.reports_to_designation_id || "",
    });
  };

  const getReportsToName = (designationId: string) => {
    const relation = reporting.find(r => r.designation_id === designationId);
    if (!relation?.reports_to_designation_id) return null;
    const parentDesignation = designationsWithCounts.find(d => d.id === relation.reports_to_designation_id);
    return parentDesignation?.name || null;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Designations</h1>
            <p className="text-muted-foreground">Manage organizational designations and reporting structure</p>
          </div>
          <Button onClick={() => dialog.openDialog()}>
            <Plus className="w-4 h-4 mr-2" />
            Add Designation
          </Button>
        </div>

        <FormDialog
          open={dialog.isOpen}
          onOpenChange={(open) => !open && dialog.closeDialog()}
          title={dialog.isEditing ? "Edit Designation" : "Create Designation"}
          onSubmit={handleSubmit}
          isLoading={isSubmitting}
          submitLabel={dialog.isEditing ? "Update" : "Create"}
        >
          <div>
            <Label htmlFor="name">Designation Name *</Label>
            <Input
              id="name"
              value={dialog.formData.name}
              onChange={(e) => dialog.updateFormData({ name: e.target.value })}
              placeholder="e.g., Senior Sales Manager"
              required
            />
          </div>

          <div>
            <Label htmlFor="role">Role *</Label>
            <Select
              value={dialog.formData.role}
              onValueChange={(value) => dialog.updateFormData({ role: value })}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="reports_to">Reports To</Label>
            <Select
              value={dialog.formData.reports_to || "none"}
              onValueChange={(value) => dialog.updateFormData({ reports_to: value === "none" ? "" : value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="No direct report" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (Top Level)</SelectItem>
                {designationsWithCounts
                  .filter(d => d.id !== dialog.editingItem?.id)
                  .map((des) => (
                    <SelectItem key={des.id} value={des.id}>
                      {des.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={dialog.formData.description}
              onChange={(e) => dialog.updateFormData({ description: e.target.value })}
              placeholder="Describe this designation"
              rows={3}
            />
          </div>
        </FormDialog>

        <div className="grid gap-4">
          {isLoading ? (
            <LoadingState />
          ) : designationsWithCounts.length === 0 ? (
            <EmptyState message="No designations configured yet. Click 'Add Designation' to get started." />
          ) : (
            designationsWithCounts.map((designation) => {
              const reportsTo = getReportsToName(designation.id);
              return (
                <Card key={designation.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle>{designation.name}</CardTitle>
                        <CardDescription>
                          <Badge variant="secondary" className="mr-2">
                            {ROLES.find(r => r.value === designation.role)?.label}
                          </Badge>
                          {reportsTo && (
                            <span className="text-sm">Reports to: {reportsTo}</span>
                          )}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(designation)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteConfirm(designation.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {designation.description && (
                      <p className="text-sm text-muted-foreground mb-3">{designation.description}</p>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="w-4 h-4" />
                      <span>{designation.employee_count || 0} employee{(designation.employee_count || 0) !== 1 ? 's' : ''}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Delete Designation"
        description="Are you sure you want to delete this designation? This action cannot be undone."
        onConfirm={handleDelete}
        confirmText="Delete"
        variant="destructive"
      />
    </DashboardLayout>
  );
}
