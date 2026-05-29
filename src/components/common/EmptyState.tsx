import { Card, CardContent } from "@/components/ui/card";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  message: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  message,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <Card className={className}>
      <CardContent className="py-8 text-center">
        {icon && <div className="flex justify-center mb-4">{icon}</div>}
        {title && <h3 className="text-lg font-semibold mb-2">{title}</h3>}
        <p className="text-muted-foreground mb-4">{message}</p>
        {action && <div className="mt-4">{action}</div>}
      </CardContent>
    </Card>
  );
}
