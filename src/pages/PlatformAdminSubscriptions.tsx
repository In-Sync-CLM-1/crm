import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNotification } from "@/hooks/useNotification";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, DollarSign, Users, AlertCircle, Plus, Edit } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import DashboardLayout from "@/components/Layout/DashboardLayout";

export default function PlatformAdminSubscriptions() {
  const notify = useNotification();
  const { isPlatformAdmin, isLoading: orgLoading } = useOrgContext();
  const navigate = useNavigate();

  // Redirect non-platform admins
  useEffect(() => {
    if (!orgLoading && isPlatformAdmin === false) {
      notify.error("Access Denied", "Only platform admins can access subscription management.");
      navigate("/dashboard");
    }
  }, [isPlatformAdmin, orgLoading, navigate, notify]);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState<any>(null);
  const [overrideDate, setOverrideDate] = useState<Date>();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState({
    org_id: '',
    subscription_status: 'active',
    billing_cycle_start: new Date().toISOString().split('T')[0],
    next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    user_count: 1,
    monthly_subscription_amount: 500,
    one_time_setup_fee: 0,
    wallet_balance: 5000,
    wallet_minimum_balance: 5000,
    wallet_auto_topup_enabled: true,
  });

  const { data: organizations } = useQuery({
    queryKey: ['all-organizations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: subscriptions, isLoading, refetch } = useQuery({
    queryKey: ["platform-admin-subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_subscriptions")
        .select(`
          *,
          organizations!inner(id, name, slug)
        `)
        .order("subscription_status", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const { data: invoices } = useQuery({
    queryKey: ["platform-admin-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_invoices")
        .select(`
          *,
          organizations!inner(name)
        `)
        .in("payment_status", ["pending", "overdue"])
        .order("due_date", { ascending: true })
        .limit(10);
      
      if (error) throw error;
      return data;
    },
  });

  const handleSaveSubscription = async () => {
    try {
      if (editMode === 'create') {
        const { error } = await supabase
          .from('organization_subscriptions')
          .insert([{
            org_id: formData.org_id,
            subscription_status: formData.subscription_status,
            billing_cycle_start: formData.billing_cycle_start,
            next_billing_date: formData.next_billing_date,
            user_count: formData.user_count,
            monthly_subscription_amount: formData.monthly_subscription_amount,
            one_time_setup_fee: formData.one_time_setup_fee,
            wallet_balance: formData.wallet_balance,
            wallet_minimum_balance: formData.wallet_minimum_balance,
            wallet_auto_topup_enabled: formData.wallet_auto_topup_enabled,
          }]);

        if (error) throw error;

        notify.success("Success", "Subscription created successfully");
      } else {
        const { error } = await supabase
          .from('organization_subscriptions')
          .update({
            subscription_status: formData.subscription_status,
            billing_cycle_start: formData.billing_cycle_start,
            next_billing_date: formData.next_billing_date,
            user_count: formData.user_count,
            monthly_subscription_amount: formData.monthly_subscription_amount,
            one_time_setup_fee: formData.one_time_setup_fee,
            wallet_balance: formData.wallet_balance,
            wallet_minimum_balance: formData.wallet_minimum_balance,
            wallet_auto_topup_enabled: formData.wallet_auto_topup_enabled,
          })
          .eq('id', selectedSubscription?.id);

        if (error) throw error;

        notify.success("Success", "Subscription updated successfully");
      }

      setEditDialogOpen(false);
      refetch();
    } catch (error: any) {
      notify.error("Error", error);
    }
  };

  const handleOverrideSubscription = async () => {
    try {
      const { error } = await supabase
        .from('organization_subscriptions')
        .update({
          subscription_status: 'active',
          suspension_override_until: overrideDate?.toISOString().split('T')[0],
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedSubscription?.id);

      if (error) throw error;

      notify.success("Success", "Subscription status overridden successfully");

      setOverrideDialogOpen(false);
      setOverrideDate(undefined);
      refetch();
    } catch (error: any) {
      notify.error("Error", error);
    }
  };

  const openCreateDialog = () => {
    setEditMode('create');
    setFormData({
      org_id: '',
      subscription_status: 'active',
      billing_cycle_start: new Date().toISOString().split('T')[0],
      next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      user_count: 1,
      monthly_subscription_amount: 500,
      one_time_setup_fee: 0,
      wallet_balance: 5000,
      wallet_minimum_balance: 5000,
      wallet_auto_topup_enabled: true,
    });
    setEditDialogOpen(true);
  };

  const openEditDialog = (subscription: any) => {
    setEditMode('edit');
    setSelectedSubscription(subscription);
    setFormData({
      org_id: subscription.org_id,
      subscription_status: subscription.subscription_status,
      billing_cycle_start: subscription.billing_cycle_start,
      next_billing_date: subscription.next_billing_date,
      user_count: subscription.user_count,
      monthly_subscription_amount: subscription.monthly_subscription_amount,
      one_time_setup_fee: subscription.one_time_setup_fee || 0,
      wallet_balance: subscription.wallet_balance,
      wallet_minimum_balance: subscription.wallet_minimum_balance,
      wallet_auto_topup_enabled: subscription.wallet_auto_topup_enabled,
    });
    setEditDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: "default",
      suspended_grace: "secondary",
      suspended_readonly: "destructive",
      suspended_locked: "destructive",
      cancelled: "outline",
    };
    return <Badge variant={variants[status] || "default"}>{status.replace(/_/g, " ")}</Badge>;
  };

  if (isLoading) {
    return <DashboardLayout><div>Loading...</div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Subscription Management</h1>
          <p className="text-muted-foreground">Platform admin view of all organization subscriptions</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Create Subscription
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Organizations</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{subscriptions?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {subscriptions?.filter(s => s.subscription_status === "active").length || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Suspended</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {subscriptions?.filter(s => s.subscription_status?.startsWith("suspended")).length || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue Invoices</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {invoices?.filter(i => i.payment_status === "overdue").length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Subscriptions</CardTitle>
          <CardDescription>Manage organization subscriptions and overrides</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {subscriptions?.map((sub: any) => (
              <div
                key={sub.org_id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="space-y-1">
                  <p className="font-medium">{sub.organizations.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Users: {sub.user_count} | Monthly: ₹{sub.monthly_subscription_amount} | Wallet: ₹{sub.wallet_balance}
                  </p>
                  {sub.suspension_override_until && (
                    <p className="text-xs text-amber-600">
                      Override until: {sub.suspension_override_until}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(sub.subscription_status)}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEditDialog(sub)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  {sub.subscription_status !== "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedSubscription(sub);
                        setOverrideDialogOpen(true);
                      }}
                    >
                      Override
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending & Overdue Invoices</CardTitle>
          <CardDescription>Recent invoices requiring attention</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {invoices?.map((invoice: any) => (
              <div
                key={invoice.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="space-y-1">
                  <p className="font-medium">{invoice.organizations.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {invoice.invoice_number} | Due: {invoice.due_date}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Created {formatDistanceToNow(new Date(invoice.invoice_date), { addSuffix: true })}
                  </p>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-xl font-bold">₹{invoice.total_amount}</p>
                  <Badge
                    variant={invoice.payment_status === "overdue" ? "destructive" : "secondary"}
                  >
                    {invoice.payment_status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editMode === 'create' ? 'Create Subscription' : 'Edit Subscription'}</DialogTitle>
            <DialogDescription>
              {editMode === 'create' ? 'Create a new subscription for an organization' : 'Update subscription details'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Organization</Label>
              {editMode === 'create' ? (
                <Select value={formData.org_id} onValueChange={(value) => setFormData({ ...formData, org_id: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations?.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={selectedSubscription?.organizations?.name || ''} disabled />
              )}
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.subscription_status} onValueChange={(value) => setFormData({ ...formData, subscription_status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended_grace">Suspended (Grace)</SelectItem>
                  <SelectItem value="suspended_readonly">Suspended (Read-only)</SelectItem>
                  <SelectItem value="suspended_locked">Suspended (Locked)</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Billing Cycle Start</Label>
                <Input
                  type="date"
                  value={formData.billing_cycle_start}
                  onChange={(e) => setFormData({ ...formData, billing_cycle_start: e.target.value })}
                />
              </div>
              <div>
                <Label>Next Billing Date</Label>
                <Input
                  type="date"
                  value={formData.next_billing_date}
                  onChange={(e) => setFormData({ ...formData, next_billing_date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>User Count</Label>
                <Input
                  type="number"
                  value={formData.user_count}
                  onChange={(e) => setFormData({ ...formData, user_count: parseInt(e.target.value) })}
                />
              </div>
              <div>
                <Label>Monthly Amount (₹)</Label>
                <Input
                  type="number"
                  value={formData.monthly_subscription_amount}
                  onChange={(e) => setFormData({ ...formData, monthly_subscription_amount: parseFloat(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <Label>One-Time Setup Fee (₹)</Label>
              <Input
                type="number"
                value={formData.one_time_setup_fee}
                onChange={(e) => setFormData({ ...formData, one_time_setup_fee: parseFloat(e.target.value) || 0 })}
                placeholder="0"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Wallet Balance (₹)</Label>
                <Input
                  type="number"
                  value={formData.wallet_balance}
                  onChange={(e) => setFormData({ ...formData, wallet_balance: parseFloat(e.target.value) })}
                />
              </div>
              <div>
                <Label>Minimum Wallet Balance (₹)</Label>
                <Input
                  type="number"
                  value={formData.wallet_minimum_balance}
                  onChange={(e) => setFormData({ ...formData, wallet_minimum_balance: parseFloat(e.target.value) })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveSubscription}>
              {editMode === 'create' ? 'Create' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override Subscription Status</DialogTitle>
            <DialogDescription>
              Set a temporary override to restore this subscription to active status
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">
              Organization: <strong>{selectedSubscription?.organizations?.name}</strong>
            </p>
            <div>
              <Label htmlFor="override-date">Override Until Date</Label>
              <Input
                id="override-date"
                type="date"
                value={overrideDate?.toISOString().split('T')[0] || ''}
                onChange={(e) => setOverrideDate(new Date(e.target.value))}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleOverrideSubscription}>Apply Override</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </DashboardLayout>
  );
}