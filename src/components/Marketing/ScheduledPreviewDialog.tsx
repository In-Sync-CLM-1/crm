import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScheduledPlan } from "@/lib/contentSchedule";
import { format } from "date-fns";

export function ScheduledPreviewDialog({
  date,
  plan,
  open,
  onOpenChange,
}: {
  date: Date | null;
  plan: ScheduledPlan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!plan || !date) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Scheduled for {format(date, "MMMM d, yyyy")}</DialogTitle>
          <DialogDescription>
            Not written yet — the AI generates this the night before. This is the plan it will follow.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <Badge>{plan.product_name}</Badge>
            <Badge variant="secondary">{plan.format}</Badge>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Content angle</div>
            <p className="text-foreground">{plan.angle}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
