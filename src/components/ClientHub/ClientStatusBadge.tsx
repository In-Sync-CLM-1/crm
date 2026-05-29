import { Badge } from "@/components/ui/badge";
import { CheckCircle, PauseCircle, XCircle } from "lucide-react";

type ClientStatus = 'active' | 'inactive' | 'churned';

interface ClientStatusBadgeProps {
  status: ClientStatus | string | null | undefined;
  showIcon?: boolean;
  className?: string;
}

const statusConfig: Record<ClientStatus, { label: string; variant: "default" | "secondary" | "destructive"; icon: typeof CheckCircle; className: string }> = {
  active: {
    label: "Active",
    variant: "default",
    icon: CheckCircle,
    className: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200",
  },
  inactive: {
    label: "Inactive",
    variant: "secondary",
    icon: PauseCircle,
    className: "bg-muted text-muted-foreground hover:bg-muted border-border",
  },
  churned: {
    label: "Churned",
    variant: "destructive",
    icon: XCircle,
    className: "bg-destructive/10 text-destructive hover:bg-destructive/10 border-destructive/20",
  },
};

export function ClientStatusBadge({ status, showIcon = true, className = "" }: ClientStatusBadgeProps) {
  const normalizedStatus = (status?.toLowerCase() || 'active') as ClientStatus;
  const config = statusConfig[normalizedStatus] || statusConfig.active;
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`${config.className} ${className}`}>
      {showIcon && <Icon className="h-3 w-3 mr-1" />}
      {config.label}
    </Badge>
  );
}
