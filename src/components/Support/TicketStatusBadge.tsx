import { Badge } from "@/components/ui/badge";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  new: { label: "New", variant: "destructive" },
  open: { label: "Open", variant: "destructive" },
  assigned: { label: "Assigned", variant: "default" },
  in_progress: { label: "In Progress", variant: "default" },
  awaiting_client: { label: "Awaiting Client", variant: "secondary" },
  resolved: { label: "Resolved", variant: "secondary" },
  closed: { label: "Closed", variant: "outline" },
};

const priorityConfig: Record<string, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-muted text-muted-foreground" },
  medium: { label: "Medium", className: "bg-primary/20 text-primary" },
  high: { label: "High", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  critical: { label: "Critical", className: "bg-destructive/20 text-destructive" },
};

export function TicketStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status, variant: "outline" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function TicketPriorityBadge({ priority }: { priority: string }) {
  const config = priorityConfig[priority] || { label: priority, className: "" };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}>{config.label}</span>;
}
