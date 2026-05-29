import { Badge } from "@/components/ui/badge";

const statusVariants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  inactive: "secondary",
  pending: "outline",
  completed: "default",
  failed: "destructive",
  draft: "secondary",
  published: "default",
  archived: "secondary",
};

interface StatusBadgeProps {
  status: string;
  variant?: "default" | "secondary" | "outline" | "destructive";
}

export function StatusBadge({ status, variant }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase();
  const badgeVariant = variant || statusVariants[normalizedStatus] || "default";

  return (
    <Badge variant={badgeVariant}>
      {status}
    </Badge>
  );
}
