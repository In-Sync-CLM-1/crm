import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScheduledPlan, themeLabel } from "@/lib/contentSchedule";
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
          <DialogTitle>Scheduled for {format(date, "MMMM d, yyyy")} · {plan.slot_time} IST</DialogTitle>
          <DialogDescription>
            Not written yet — the AI writes content up to a week in advance, so this will appear here for review well before its posting time. This is the plan it will follow.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge>{plan.channel === "member" ? "Amit's profile" : "Company page"}</Badge>
            <Badge variant="secondary">{plan.format}</Badge>
            <Badge variant="outline">{plan.slot_time} IST</Badge>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">{plan.channel === "member" ? "Pillar" : "Brand theme"}</div>
            <p className="text-foreground">{plan.channel === "member" ? plan.theme : themeLabel(plan.theme)}</p>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Content angle</div>
            <p className="text-foreground">{plan.angle}</p>
          </div>
          {plan.product_name && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Proof-point product</div>
              <p className="text-foreground">{plan.product_name} — woven in as an example, not pitched standalone</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
