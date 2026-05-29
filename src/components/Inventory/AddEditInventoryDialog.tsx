import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNotification } from "@/hooks/useNotification";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface AddEditInventoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: any;
  orgId: string;
}

export function AddEditInventoryDialog({ open, onOpenChange, item, orgId }: AddEditInventoryDialogProps) {
  const notify = useNotification();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<any>({
    item_id_sku: "",
    item_name: "",
    available_qty: 0,
    uom: "Nos",
    pending_po: 0,
    pending_so: 0,
    selling_price: 0,
    amount: 0,
  });

  useEffect(() => {
    if (item) {
      setFormData(item);
    } else {
      setFormData({
        item_id_sku: "",
        item_name: "",
        available_qty: 0,
        uom: "Nos",
        pending_po: 0,
        pending_so: 0,
        selling_price: 0,
        amount: 0,
      });
    }
  }, [item, open]);

  // Auto-calculate amount when qty or price changes
  useEffect(() => {
    const qty = Number(formData.available_qty) || 0;
    const price = Number(formData.selling_price) || 0;
    const calculatedAmount = qty * price;
    
    if (formData.amount !== calculatedAmount) {
      setFormData((prev: any) => ({ ...prev, amount: calculatedAmount }));
    }
  }, [formData.available_qty, formData.selling_price]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const dataToSave = {
        ...formData,
        org_id: orgId,
      };

      if (item) {
        const { error } = await supabase
          .from("inventory_items")
          .update(dataToSave)
          .eq("id", item.id);

        if (error) throw error;

        notify.success("Item updated successfully");
      } else {
        const { error } = await supabase
          .from("inventory_items")
          .insert(dataToSave);

        if (error) throw error;

        notify.success("Item added successfully");
      }

      onOpenChange(false);
    } catch (error: any) {
      notify.error("Error", error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? "Edit" : "Add"} Inventory Item</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="item_id_sku">Item ID / SKU *</Label>
              <Input
                id="item_id_sku"
                value={formData.item_id_sku || ""}
                onChange={(e) => handleChange("item_id_sku", e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="item_name">Item Name *</Label>
              <Input
                id="item_name"
                value={formData.item_name || ""}
                onChange={(e) => handleChange("item_name", e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="available_qty">Quantity *</Label>
              <Input
                id="available_qty"
                type="number"
                value={formData.available_qty || 0}
                onChange={(e) => handleChange("available_qty", Number(e.target.value))}
                required
              />
            </div>
            <div>
              <Label htmlFor="uom">Unit *</Label>
              <Select value={formData.uom || "Nos"} onValueChange={(val) => handleChange("uom", val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Nos">Nos</SelectItem>
                  <SelectItem value="Box">Box</SelectItem>
                  <SelectItem value="Packet">Packet</SelectItem>
                  <SelectItem value="Kg">Kg</SelectItem>
                  <SelectItem value="Meter">Meter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pending_po">Pending P/O</Label>
              <Input
                id="pending_po"
                type="number"
                value={formData.pending_po || 0}
                onChange={(e) => handleChange("pending_po", Number(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="pending_so">Pending S/O</Label>
              <Input
                id="pending_so"
                type="number"
                value={formData.pending_so || 0}
                onChange={(e) => handleChange("pending_so", Number(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="selling_price">Price (₹) *</Label>
              <Input
                id="selling_price"
                type="number"
                step="0.01"
                value={formData.selling_price || 0}
                onChange={(e) => handleChange("selling_price", Number(e.target.value))}
                required
              />
            </div>
            <div>
              <Label htmlFor="amount">Amount (₹)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={formData.amount || 0}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground mt-1">Auto-calculated: Qty × Price</p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {item ? "Update" : "Add"} Item
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
