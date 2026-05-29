import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Clock, TrendingUp, Zap, Info, 
  BarChart3, Calendar 
} from "lucide-react";
import { useOrgContext } from "@/hooks/useOrgContext";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const DAYS_OF_WEEK = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 
  'Thursday', 'Friday', 'Saturday'
];

export function SmartSendTimeConfig() {
  const { effectiveOrgId } = useOrgContext();
  const [optimizeEnabled, setOptimizeEnabled] = useState(true);

  const { data: patterns, isLoading } = useQuery({
    queryKey: ['email-engagement-patterns', effectiveOrgId],
    queryFn: async () => {
      // Get org-wide best performing times
      const { data, error } = await supabase
        .from('email_engagement_patterns')
        .select('hour_of_day, day_of_week, engagement_score')
        .eq('org_id', effectiveOrgId)
        .order('engagement_score', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId,
  });

  const { data: stats } = useQuery({
    queryKey: ['engagement-pattern-stats', effectiveOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_engagement_patterns')
        .select('engagement_score, open_count, click_count')
        .eq('org_id', effectiveOrgId);
      
      if (error) throw error;
      
      const totalPatterns = data.length;
      const avgScore = data.reduce((sum, p) => sum + Number(p.engagement_score), 0) / totalPatterns;
      const totalOpens = data.reduce((sum, p) => sum + p.open_count, 0);
      const totalClicks = data.reduce((sum, p) => sum + p.click_count, 0);
      
      return {
        totalPatterns,
        avgScore: avgScore.toFixed(2),
        totalOpens,
        totalClicks,
      };
    },
    enabled: !!effectiveOrgId,
  });

  const formatTime = (hour: number) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:00 ${period}`;
  };

  const handleToggleOptimization = () => {
    setOptimizeEnabled(!optimizeEnabled);
    toast.success(
      optimizeEnabled 
        ? 'Smart send time optimization disabled' 
        : 'Smart send time optimization enabled'
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Smart Send Time Optimization
              </CardTitle>
              <CardDescription className="mt-2">
                Automatically send emails when contacts are most likely to engage
              </CardDescription>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-5 w-5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    AI analyzes when each contact typically opens and clicks emails,
                    then automatically schedules sends for optimal engagement times.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div className="space-y-1">
              <Label htmlFor="optimize-enabled" className="text-base">
                Enable Smart Send Time
              </Label>
              <p className="text-sm text-muted-foreground">
                Optimize send times based on individual contact behavior
              </p>
            </div>
            <Switch
              id="optimize-enabled"
              checked={optimizeEnabled}
              onCheckedChange={handleToggleOptimization}
            />
          </div>

          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{stats.totalPatterns}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Learning Patterns
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{stats.avgScore}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Avg Engagement
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{stats.totalOpens}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Total Opens
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{stats.totalClicks}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Total Clicks
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      {patterns && patterns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Top Performing Send Times
            </CardTitle>
            <CardDescription>
              Organization-wide best times based on engagement data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {patterns.slice(0, 5).map((pattern, index) => (
                <div
                  key={`${pattern.hour_of_day}-${pattern.day_of_week}`}
                  className="flex items-center justify-between p-4 rounded-lg border"
                >
                  <div className="flex items-center gap-4">
                    <Badge variant={index === 0 ? "default" : "outline"}>
                      #{index + 1}
                    </Badge>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {DAYS_OF_WEEK[pattern.day_of_week]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{formatTime(pattern.hour_of_day)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-success" />
                    <span className="font-semibold text-success">
                      {Number(pattern.engagement_score).toFixed(1)} score
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="text-center py-8 text-muted-foreground">
          Loading engagement data...
        </div>
      )}

      {!isLoading && (!patterns || patterns.length === 0) && (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p className="text-muted-foreground mb-2">
              No engagement data yet
            </p>
            <p className="text-sm text-muted-foreground">
              Send time optimization will learn from email opens and clicks
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
