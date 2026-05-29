import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Target, Plus, Pencil } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface RevenueGoal {
  id: string;
  period_type: string;
  period_start: string;
  period_end: string;
  goal_amount: number;
  notes?: string;
}

interface RevenueGoalProgressProps {
  goal: RevenueGoal | null;
  actualRevenue: number;
  currency?: string;
  onSetGoal: () => void;
}

const formatCurrency = (amount: number, currency: string = "INR") => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
};

export function RevenueGoalProgress({
  goal,
  actualRevenue,
  currency = "INR",
  onSetGoal,
}: RevenueGoalProgressProps) {
  if (!goal) {
    return (
      <Card className="border-dashed border-2 bg-muted/30">
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <Target className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-3">No revenue goal set for this period</p>
            <Button onClick={onSetGoal} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Set Revenue Goal
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const percentage = goal.goal_amount > 0 
    ? Math.min((actualRevenue / goal.goal_amount) * 100, 100) 
    : 0;
  
  const progressColor = percentage >= 80 
    ? "bg-emerald-500" 
    : percentage >= 50 
      ? "bg-amber-500" 
      : "bg-red-500";

  const remaining = Math.max(goal.goal_amount - actualRevenue, 0);
  const isAchieved = actualRevenue >= goal.goal_amount;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Revenue Goal - {goal.period_type.charAt(0).toUpperCase() + goal.period_type.slice(1)}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onSetGoal} className="gap-1">
            <Pencil className="h-3 w-3" />
            Edit
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between items-end">
          <div>
            <p className="text-sm text-muted-foreground">Target</p>
            <p className="text-xl font-bold">{formatCurrency(goal.goal_amount, currency)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Achieved</p>
            <p className={cn("text-xl font-bold", isAchieved ? "text-emerald-600" : "")}>
              {formatCurrency(actualRevenue, currency)}
            </p>
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="relative h-4 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn("h-full transition-all duration-500", progressColor)}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <div className="flex justify-between text-sm">
            <span className={cn("font-medium", isAchieved ? "text-emerald-600" : "text-muted-foreground")}>
              {percentage.toFixed(1)}% {isAchieved ? "🎉 Goal Achieved!" : "completed"}
            </span>
            {!isAchieved && (
              <span className="text-muted-foreground">
                {formatCurrency(remaining, currency)} remaining
              </span>
            )}
          </div>
        </div>

        {goal.notes && (
          <p className="text-sm text-muted-foreground italic border-t pt-3">
            {goal.notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
