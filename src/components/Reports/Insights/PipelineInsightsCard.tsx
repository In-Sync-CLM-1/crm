import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle } from "lucide-react";

interface PipelineMetric {
  name: string;
  count: number;
  probability: number;
  avgDays: number;
  conversionRate: number;
  trend: "up" | "down" | "neutral";
}

interface PipelineInsightsCardProps {
  metrics: PipelineMetric[];
}

export default function PipelineInsightsCard({ metrics }: PipelineInsightsCardProps) {
  const totalContacts = metrics.reduce((sum, m) => sum + m.count, 0);
  const highValueStages = metrics.filter(m => m.probability >= 70);
  const bottlenecks = metrics.filter(m => m.conversionRate < 50 && m.count > 0);

  const getTrendIcon = (trend: string) => {
    if (trend === "up") return <TrendingUp className="h-4 w-4 text-success" />;
    if (trend === "down") return <TrendingDown className="h-4 w-4 text-destructive" />;
    return <div className="h-4 w-4" />;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Pipeline Health</CardTitle>
            <CardDescription>Real-time pipeline performance metrics</CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{totalContacts}</div>
            <div className="text-sm text-muted-foreground">Total Contacts</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* High-Value Stages Alert */}
        {highValueStages.length > 0 && (
          <div className="rounded-lg border border-warning/20 bg-warning/5 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-warning mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-sm">High-Value Stages Require Attention</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {highValueStages.reduce((sum, s) => sum + s.count, 0)} contacts in high-probability stages
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {highValueStages.map((stage) => (
                    <Badge key={stage.name} variant="outline">
                      {stage.name}: {stage.count}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bottleneck Warning */}
        {bottlenecks.length > 0 && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-sm">Pipeline Bottlenecks Detected</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Low conversion rates in {bottlenecks.length} stage{bottlenecks.length > 1 ? 's' : ''}
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {bottlenecks.map((stage) => (
                    <Badge key={stage.name} variant="destructive">
                      {stage.name}: {stage.conversionRate}% conversion
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stage Breakdown */}
        <div>
          <h4 className="text-sm font-medium mb-3">Stage Velocity</h4>
          <div className="space-y-3">
            {metrics.map((metric) => (
              <div key={metric.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1">
                  {getTrendIcon(metric.trend)}
                  <div>
                    <div className="text-sm font-medium">{metric.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Avg. {metric.avgDays} days • {metric.conversionRate}% conversion
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold">{metric.count}</div>
                  <div className="text-xs text-muted-foreground">{metric.probability}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Performance Summary */}
        {bottlenecks.length === 0 && highValueStages.every(s => s.avgDays < 14) && (
          <div className="rounded-lg border border-success/20 bg-success/5 p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-success" />
              <div>
                <p className="font-medium text-sm">Pipeline Running Smoothly</p>
                <p className="text-sm text-muted-foreground">
                  No major bottlenecks detected. Keep up the momentum!
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
