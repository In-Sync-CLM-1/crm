import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lightbulb, AlertTriangle, TrendingDown, TrendingUp, Minus, X, ExternalLink, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNotification } from "@/hooks/useNotification";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

/** Full insight from campaign_insights table */
interface FullInsight {
  id: string;
  priority: string;
  insight_type: string;
  title: string;
  description: string;
  impact?: string;
  suggested_action?: string;
  supporting_data?: Record<string, any>;
  campaign_id?: string;
  created_at?: string;
}

/** Simple insight for quick display */
interface SimpleInsight {
  title: string;
  description: string;
  type: "success" | "warning" | "info" | "error";
  metric?: string;
  trend?: "up" | "down" | "neutral";
}

interface InsightCardFullProps {
  insight: FullInsight;
  onUpdate: () => void;
  variant?: "full";
}

interface InsightCardSimpleProps {
  insight: SimpleInsight;
  variant: "simple";
  onUpdate?: never;
}

type InsightCardProps = InsightCardFullProps | InsightCardSimpleProps;

export default function InsightCard(props: InsightCardProps) {
  if (props.variant === "simple") {
    return <SimpleInsightCard insight={props.insight} />;
  }
  return <FullInsightCard insight={props.insight} onUpdate={props.onUpdate} />;
}

function SimpleInsightCard({ insight }: { insight: SimpleInsight }) {
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

function FullInsightCard({ insight, onUpdate }: { insight: FullInsight; onUpdate: () => void }) {
  const notify = useNotification();
  const navigate = useNavigate();

  const handleDismiss = async () => {
    const { error } = await supabase
      .from('campaign_insights')
      .update({ status: 'dismissed' })
      .eq('id', insight.id);

    if (error) {
      notify.error("Error", "Failed to dismiss insight");
    } else {
      notify.success("Success", "Insight dismissed");
      onUpdate();
    }
  };

  const handleTakeAction = () => {
    if (insight.campaign_id) {
      navigate(`/email-campaigns/${insight.campaign_id}`);
    } else {
      navigate('/pipeline');
    }
  };

  const getIcon = () => {
    switch (insight.insight_type) {
      case 'bottleneck':
      case 'at_risk_deals':
        return <AlertTriangle className="h-5 w-5" />;
      case 'velocity_issue':
        return <TrendingDown className="h-5 w-5" />;
      default:
        return <Lightbulb className="h-5 w-5" />;
    }
  };

  const getPriorityVariant = () => {
    switch (insight.priority) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const sourceType = insight.campaign_id ? 'Campaign' : 'Pipeline';

  return (
    <Card className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2"
        onClick={handleDismiss}
      >
        <X className="h-4 w-4" />
      </Button>
      
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="text-primary mt-1">{getIcon()}</div>
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={getPriorityVariant()}>{insight.priority}</Badge>
              <Badge variant="outline">{sourceType}</Badge>
              {insight.created_at && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDistanceToNow(new Date(insight.created_at), { addSuffix: true })}
                </span>
              )}
            </div>
            <CardTitle className="text-lg pr-8">{insight.title}</CardTitle>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{insight.description}</p>
        
        {insight.impact && (
          <div className="bg-muted/50 p-3 rounded-lg">
            <p className="text-sm font-medium">Expected Impact</p>
            <p className="text-sm text-muted-foreground">{insight.impact}</p>
          </div>
        )}

        {insight.supporting_data && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            {Object.entries(insight.supporting_data).map(([key, value]) => (
              <div key={key} className="bg-background border rounded p-2">
                <p className="text-xs text-muted-foreground capitalize">{key}</p>
                <p className="font-semibold">{String(value)}</p>
              </div>
            ))}
          </div>
        )}

        {insight.suggested_action && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Recommended Action</p>
            <p className="text-sm text-muted-foreground">{insight.suggested_action}</p>
            <Button onClick={handleTakeAction} className="w-full" variant="default">
              <ExternalLink className="h-4 w-4 mr-2" />
              Take Action
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { InsightCard };
