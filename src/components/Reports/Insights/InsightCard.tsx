import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface InsightCardProps {
  insight: {
    title: string;
    description: string;
    type: "success" | "warning" | "info" | "error";
    metric?: string;
    trend?: "up" | "down" | "neutral";
  };
}

export default function InsightCard({ insight }: InsightCardProps) {
  const getTrendIcon = () => {
    switch (insight.trend) {
      case "up":
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "down":
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTypeVariant = () => {
    switch (insight.type) {
      case "success":
        return "default";
      case "warning":
        return "secondary";
      case "error":
        return "destructive";
      default:
        return "outline";
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{insight.title}</CardTitle>
          <Badge variant={getTypeVariant()}>{insight.type}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">{insight.description}</p>
        {insight.metric && (
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{insight.metric}</span>
            {getTrendIcon()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
