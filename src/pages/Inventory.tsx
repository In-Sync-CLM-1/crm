import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Package, Plus, Search, Upload } from "lucide-react";
import { useNotification } from "@/hooks/useNotification";
import { useOrgContext } from "@/hooks/useOrgContext";
import { AddEditInventoryDialog } from "@/components/Inventory/AddEditInventoryDialog";
import { BulkUploadInventoryDialog } from "@/components/Inventory/BulkUploadInventoryDialog";
import { BulkDeleteButton } from "@/components/common/BulkDeleteButton";
import { Checkbox } from "@/components/ui/checkbox";

export default function Inventory() {
  const notify = useNotification();
  const { effectiveOrgId } = useOrgContext();
  const [search, setSearch] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showBulkUploadDialog, setShowBulkUploadDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const { data: inventory, isLoading, refetch } = useQuery({
    queryKey: ["inventory", effectiveOrgId, search],
    queryFn: async () => {
      let query = supabase
        .from("inventory_items")
        .select("*")
        .eq("org_id", effectiveOrgId)
        .order("created_at", { ascending: false });

      if (search) {
        query = query.or(`item_id_sku.ilike.%${search}%,item_name.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId,
  });

  const { data: stats } = useQuery({
    queryKey: ["inventory-stats", effectiveOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("available_qty, pending_po, pending_so")
        .eq("org_id", effectiveOrgId);

      if (error) throw error;

      const totalItems = data.length;
      const totalQty = data.reduce((sum, item) => sum + (Number(item.available_qty) || 0), 0);
      const totalEffectiveStock = data.reduce((sum, item) => {
        const qty = Number(item.available_qty) || 0;
        const po = Number(item.pending_po) || 0;
        const so = Number(item.pending_so) || 0;
        return sum + (qty - so + po);
      }, 0);

      return { totalItems, totalQty, totalEffectiveStock };
    },
    enabled: !!effectiveOrgId,
  });

  const handleExport = () => {
    if (!inventory || inventory.length === 0) {
      notify.error("No data to export");
      return;
    }

    const headers = [
      "SKU",
      "Item Name",
      "Qty",
      "Unit",
      "Pending P/O",
      "Pending S/O",
      "Effective Stock",
      "Price",
      "Amount"
    ].join(",");

    const rows = inventory.map(item => {
      const effectiveStock = (Number(item.available_qty) || 0) - (Number(item.pending_so) || 0) + (Number(item.pending_po) || 0);
      return [
        item.item_id_sku,
        `"${item.item_name || ""}"`,
        item.available_qty || 0,
        item.uom || "",
        item.pending_po || 0,
        item.pending_so || 0,
        effectiveStock,
        item.selling_price || 0,
        item.amount || 0
      ].join(",");
    });

    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory_${new Date().toISOString()}.csv`;
    a.click();
  };

  const handleEdit = (item: any) => {
    setSelectedItem(item);
    setShowAddDialog(true);
  };

  const handleCloseDialog = () => {
    setShowAddDialog(false);
    setSelectedItem(null);
    refetch();
  };

  const handleBulkDeleteSuccess = () => {
    setSelectedItems([]);
    refetch();
  };

  const toggleSelectAll = () => {
    if (selectedItems.length === inventory?.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(inventory?.map(item => item.id) || []);
    }
  };

  const toggleSelectItem = (id: string) => {
    setSelectedItems(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Inventory Management</h1>
            <p className="text-muted-foreground">Manage your inventory items</p>
          </div>
          <div className="flex gap-2">
            {selectedItems.length > 0 && (
              <BulkDeleteButton
                selectedIds={selectedItems}
                tableName="inventory_items"
                onSuccess={handleBulkDeleteSuccess}
              />
            )}
            <Button onClick={handleExport} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button onClick={() => setShowBulkUploadDialog(true)} variant="outline">
              <Upload className="mr-2 h-4 w-4" />
              Bulk Upload
            </Button>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Item
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Items</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalItems || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Quantity</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalQty || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Effective Stock</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalEffectiveStock || 0}</div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by SKU or item name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Inventory Items</CardTitle>
            <CardDescription>
              {inventory?.length || 0} items in inventory
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 py-2">
                      <Checkbox
                        checked={selectedItems.length === inventory?.length && inventory.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="py-2 text-xs">SKU</TableHead>
                    <TableHead className="py-2 text-xs">Item Name</TableHead>
                    <TableHead className="py-2 text-xs text-right">Qty</TableHead>
                    <TableHead className="py-2 text-xs">Unit</TableHead>
                    <TableHead className="py-2 text-xs text-right">Pending P/O</TableHead>
                    <TableHead className="py-2 text-xs text-right">Pending S/O</TableHead>
                    <TableHead className="py-2 text-xs text-right">Effective Stock</TableHead>
                    <TableHead className="py-2 text-xs text-right">Price</TableHead>
                    <TableHead className="py-2 text-xs text-right">Amount</TableHead>
                    <TableHead className="py-2 text-xs text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={11} className="py-1.5 text-center text-xs">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : inventory && inventory.length > 0 ? (
                    inventory.map((item) => {
                      const effectiveStock = (Number(item.available_qty) || 0) - (Number(item.pending_so) || 0) + (Number(item.pending_po) || 0);
                      
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="py-1.5">
                            <Checkbox
                              checked={selectedItems.includes(item.id)}
                              onCheckedChange={() => toggleSelectItem(item.id)}
                            />
                          </TableCell>
                          <TableCell className="py-1.5 font-medium text-xs">{item.item_id_sku}</TableCell>
                          <TableCell className="py-1.5 text-xs">{item.item_name}</TableCell>
                          <TableCell className="py-1.5 text-right text-xs">{item.available_qty || 0}</TableCell>
                          <TableCell className="py-1.5 text-xs">{item.uom || "-"}</TableCell>
                          <TableCell className="py-1.5 text-right text-xs">{item.pending_po || 0}</TableCell>
                          <TableCell className="py-1.5 text-right text-xs">{item.pending_so || 0}</TableCell>
                          <TableCell className="py-1.5 text-right font-medium text-xs">
                            <span className={effectiveStock < 0 ? "text-destructive" : ""}>
                              {effectiveStock}
                            </span>
                          </TableCell>
                          <TableCell className="py-1.5 text-right text-xs">₹{Number(item.selling_price || 0).toFixed(2)}</TableCell>
                          <TableCell className="py-1.5 text-right font-medium text-xs">₹{Number(item.amount || 0).toFixed(2)}</TableCell>
                          <TableCell className="py-1.5 text-right">
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => handleEdit(item)}>
                              Edit
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={11} className="py-1.5 text-center text-xs">
                        No inventory items found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <AddEditInventoryDialog
        open={showAddDialog}
        onOpenChange={handleCloseDialog}
        item={selectedItem}
        orgId={effectiveOrgId}
      />

      <BulkUploadInventoryDialog
        open={showBulkUploadDialog}
        onOpenChange={(open) => {
          setShowBulkUploadDialog(open);
          if (!open) refetch();
        }}
        orgId={effectiveOrgId}
        onUploadStarted={() => refetch()}
      />
    </DashboardLayout>
  );
}
