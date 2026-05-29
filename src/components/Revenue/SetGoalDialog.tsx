import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { toast } from "sonner";
import { startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, format } from "date-fns";

interface SetGoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingGoal?: {
    id: string;
    period_type: string;
    period_start: string;
    period_end: string;
    goal_amount: number;
    notes?: string;
  } | null;
  onSaved: () => void;
}

export function SetGoalDialog({ open, onOpenChange, existingGoal, onSaved }: SetGoalDialogProps) {
  const { effectiveOrgId } = useOrgContext();
  const [periodType, setPeriodType] = useState("monthly");
  const [goalAmount, setGoalAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existingGoal) {
      setPeriodType(existingGoal.period_type);
      setGoalAmount(existingGoal.goal_amount.toString());
      setNotes(existingGoal.notes || "");
    } else {
      setPeriodType("monthly");
      setGoalAmount("");
      setNotes("");
    }
  }, [existingGoal, open]);

  const getPeriodDates = (type: string) => {
    const now = new Date();
    switch (type) {
      case "monthly":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "quarterly":
        return { start: startOfQuarter(now), end: endOfQuarter(now) };
      case "yearly":
        return { start: startOfYear(now), end: endOfYear(now) };
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  const handleSave = async () => {
    if (!goalAmount || parseFloat(goalAmount) <= 0) {
      toast.error("Please enter a valid goal amount");
      return;
    }

    if (!effectiveOrgId) {
      toast.error("Organization not found");
      return;
    }

    setSaving(true);
    try {
      const { start, end } = getPeriodDates(periodType);
      const goalData = {
        org_id: effectiveOrgId,
        period_type: periodType,
        period_start: format(start, "yyyy-MM-dd"),
        period_end: format(end, "yyyy-MM-dd"),
        goal_amount: parseFloat(goalAmount),
        notes: notes || null,
      };

      if (existingGoal) {
        const { error } = await supabase
          .from("revenue_goals")
          .update(goalData)
          .eq("id", existingGoal.id);
        
        if (error) throw error;
        toast.success("Revenue goal updated successfully");
      } else {
        const { error } = await supabase
          .from("revenue_goals")
          .insert(goalData);
        
        if (error) throw error;
        toast.success("Revenue goal created successfully");
      }

      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving goal:", error);
      toast.error(error.message || "Failed to save goal");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingGoal) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from("revenue_goals")
        .delete()
        .eq("id", existingGoal.id);
      
      if (error) throw error;
      toast.success("Revenue goal deleted");
      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error deleting goal:", error);
      toast.error(error.message || "Failed to delete goal");
    } finally {
      setSaving(false);
    }
  };

  const { start, end } = getPeriodDates(periodType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existingGoal ? "Edit Revenue Goal" : "Set Revenue Goal"}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Period Type</Label>
            <Select value={periodType} onValueChange={setPeriodType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Period: {format(start, "dd MMM yyyy")} - {format(end, "dd MMM yyyy")}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Goal Amount (INR)</Label>
            <Input
              type="number"
              placeholder="e.g., 1000000"
              value={goalAmount}
              onChange={(e) => setGoalAmount(e.target.value)}
            />
            {goalAmount && parseFloat(goalAmount) > 0 && (
              <p className="text-xs text-muted-foreground">
                ₹{parseFloat(goalAmount).toLocaleString("en-IN")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Any notes about this goal..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          {existingGoal && (
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              Delete
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : existingGoal ? "Update Goal" : "Set Goal"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
