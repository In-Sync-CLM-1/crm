import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/common/LoadingState";
import { useNotification } from "@/hooks/useNotification";
import { Plus, Trash2, Edit } from "lucide-react";

interface ApprovalType {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
}

interface ApprovalRule {
  id: string;
  approval_type_id: string;
  name: string;
  description: string;
  threshold_amount: number | null;
  required_roles: string[];
  is_active: boolean;
  approval_types?: { name: string };
}

const ROLE_HIERARCHY = [
  { value: "sales_rep", label: "Sales Rep" },
  { value: "support_rep", label: "Support Rep" },
  { value: "sales_manager", label: "Sales Manager" },
  { value: "support_manager", label: "Support Manager" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super Admin" },
];

export default function ApprovalMatrix() {
  const notify = useNotification();
  const [approvalTypes, setApprovalTypes] = useState<ApprovalType[]>([]);
  const [approvalRules, setApprovalRules] = useState<ApprovalRule[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ApprovalRule | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    approval_type_id: "",
    name: "",
    description: "",
    threshold_amount: "",
    required_roles: [] as string[],
  });

  useEffect(() => {
    const fetchOrgId = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();

      if (profile?.org_id) setOrgId(profile.org_id);
    };
    fetchOrgId();
  }, []);

  const { data: typesData, refetch: refetchTypes } = useQuery({
    queryKey: ['approval-types', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("approval_types" as any)
        .select("*")
        .eq("org_id", orgId)
        .order("name");
      if (error) throw error;
      return (data || []) as any;
    },
    enabled: !!orgId,
  });

  const { data: rulesData, refetch: refetchRules } = useQuery({
    queryKey: ['approval-rules', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("approval_rules" as any)
        .select("*, approval_types(name)")
        .eq("org_id", orgId)
        .order("name");
      if (error) throw error;
      return (data || []) as any;
    },
    enabled: !!orgId,
  });

  useEffect(() => {
    if (typesData) setApprovalTypes(typesData as ApprovalType[]);
    if (rulesData) setApprovalRules(rulesData as ApprovalRule[]);
  }, [typesData, rulesData]);

  const loading = !orgId || !typesData || !rulesData;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();

      if (!profile?.org_id) return;

      const payload = {
        org_id: profile.org_id,
        approval_type_id: formData.approval_type_id,
        name: formData.name,
        description: formData.description,
        threshold_amount: formData.threshold_amount ? parseFloat(formData.threshold_amount) : null,
        required_roles: formData.required_roles,
        is_active: true,
      };

      if (editingRule) {
        const { error } = await supabase
          .from("approval_rules" as any)
          .update(payload)
          .eq("id", editingRule.id);

        if (error) throw error;
        notify.success("Success", "Approval rule updated successfully");
      } else {
        const { error } = await supabase
          .from("approval_rules" as any)
          .insert(payload);

        if (error) throw error;
        notify.success("Success", "Approval rule created successfully");
      }

      setIsDialogOpen(false);
      resetForm();
      await Promise.all([refetchTypes(), refetchRules()]);
    } catch (error: any) {
      console.error("Error saving approval rule:", error);
      notify.error("Error", "Failed to save approval rule");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this approval rule?")) return;

    try {
      const { error } = await supabase
        .from("approval_rules" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;
      notify.success("Success", "Approval rule deleted successfully");
      await refetchRules();
    } catch (error: any) {
      console.error("Error deleting approval rule:", error);
      notify.error("Error", "Failed to delete approval rule");
    }
  };

  const handleEdit = (rule: ApprovalRule) => {
    setEditingRule(rule);
    setFormData({
      approval_type_id: rule.approval_type_id,
      name: rule.name,
      description: rule.description || "",
      threshold_amount: rule.threshold_amount?.toString() || "",
      required_roles: rule.required_roles || [],
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      approval_type_id: "",
      name: "",
      description: "",
      threshold_amount: "",
      required_roles: [],
    });
    setEditingRule(null);
  };

  const toggleRole = (role: string) => {
    setFormData(prev => ({
      ...prev,
      required_roles: prev.required_roles.includes(role)
        ? prev.required_roles.filter(r => r !== role)
        : [...prev.required_roles, role].sort((a, b) => {
            const aIndex = ROLE_HIERARCHY.findIndex(r => r.value === a);
            const bIndex = ROLE_HIERARCHY.findIndex(r => r.value === b);
            return aIndex - bIndex;
          }),
    }));
  };

  if (loading) {
    return (
      <DashboardLayout>
        <LoadingState message="Loading approval matrix..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Approval Matrix</h1>
            <p className="text-muted-foreground">Configure approval rules and workflows</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Approval Rule
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingRule ? "Edit Approval Rule" : "Create Approval Rule"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="approval_type_id">Approval Type *</Label>
                  <Select
                    value={formData.approval_type_id}
                    onValueChange={(value) => setFormData({ ...formData, approval_type_id: value })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select approval type" />
                    </SelectTrigger>
                    <SelectContent>
                      {approvalTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="name">Rule Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Deals over $10,000"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe when this rule applies"
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="threshold_amount">Threshold Amount ($)</Label>
                  <Input
                    id="threshold_amount"
                    type="number"
                    step="0.01"
                    value={formData.threshold_amount}
                    onChange={(e) => setFormData({ ...formData, threshold_amount: e.target.value })}
                    placeholder="e.g., 10000"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Leave empty if not amount-based
                  </p>
                </div>

                <div>
                  <Label>Required Approval Roles (in order) *</Label>
                  <p className="text-sm text-muted-foreground mb-2">
                    Select roles in the order they need to approve. Multi-level approvals will be created automatically.
                  </p>
                  <div className="space-y-2">
                    {ROLE_HIERARCHY.map((role) => (
                      <div key={role.value} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={role.value}
                          checked={formData.required_roles.includes(role.value)}
                          onChange={() => toggleRole(role.value)}
                          className="rounded"
                        />
                        <label htmlFor={role.value} className="cursor-pointer">
                          {role.label}
                          {formData.required_roles.includes(role.value) && (
                            <span className="ml-2 text-sm text-muted-foreground">
                              (Step {formData.required_roles.indexOf(role.value) + 1})
                            </span>
                          )}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsDialogOpen(false);
                      resetForm();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingRule ? "Update Rule" : "Create Rule"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4">
          {approvalRules.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  No approval rules configured yet. Click "Add Approval Rule" to get started.
                </p>
              </CardContent>
            </Card>
          ) : (
            approvalRules.map((rule) => (
              <Card key={rule.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{rule.name}</CardTitle>
                      <CardDescription>
                        {rule.approval_types?.name}
                        {rule.threshold_amount && (
                          <span className="ml-2">• Amount: ${rule.threshold_amount.toLocaleString()}</span>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(rule)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(rule.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {rule.description && (
                    <p className="text-sm text-muted-foreground mb-4">{rule.description}</p>
                  )}
                  <div>
                    <Label className="text-sm font-medium">Approval Flow:</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {rule.required_roles?.map((role, index) => (
                        <div key={role} className="flex items-center">
                          <Badge variant="secondary">
                            Step {index + 1}: {ROLE_HIERARCHY.find(r => r.value === role)?.label || role}
                          </Badge>
                          {index < rule.required_roles.length - 1 && (
                            <span className="mx-2 text-muted-foreground">→</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
