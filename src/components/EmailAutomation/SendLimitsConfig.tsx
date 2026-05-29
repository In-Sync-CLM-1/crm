import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function SendLimitsConfig() {
  const { effectiveOrgId } = useOrgContext();
  const queryClient = useQueryClient();
  const [maxEmailsPerDay, setMaxEmailsPerDay] = useState<number>(3);

  const { data: orgSettings, isLoading } = useQuery({
    queryKey: ['org-email-settings', effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) throw new Error('No organization selected');
      
      const { data, error } = await supabase
        .from('organizations')
        .select('max_automation_emails_per_day')
        .eq('id', effectiveOrgId)
        .single();
      
      if (error) throw error;
      
      if (data.max_automation_emails_per_day) {
        setMaxEmailsPerDay(data.max_automation_emails_per_day);
      }
      
      return data;
    },
    enabled: !!effectiveOrgId,
  });

  const updateMutation = useMutation({
    mutationFn: async (maxEmails: number) => {
      if (!effectiveOrgId) throw new Error('No organization selected');
      
      const { error } = await supabase
        .from('organizations')
        .update({ max_automation_emails_per_day: maxEmails })
        .eq('id', effectiveOrgId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-email-settings'] });
      toast.success('Send limits updated successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to update send limits: ' + error.message);
    },
  });

  const handleSave = () => {
    if (maxEmailsPerDay < 1 || maxEmailsPerDay > 50) {
      toast.error('Please enter a value between 1 and 50');
      return;
    }
    updateMutation.mutate(maxEmailsPerDay);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Send Limits</CardTitle>
        <CardDescription>
          Configure global limits for automation emails to prevent spam
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            These limits apply organization-wide to prevent overwhelming contacts with too many automated emails.
            Individual rules also have their own cooldown periods (default: 1 email per 3 days).
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="maxPerDay">
              Maximum Automation Emails Per Contact Per Day
            </Label>
            <div className="flex gap-4">
              <Input
                id="maxPerDay"
                type="number"
                min={1}
                max={50}
                value={maxEmailsPerDay}
                onChange={(e) => setMaxEmailsPerDay(parseInt(e.target.value) || 1)}
                className="max-w-[200px]"
                disabled={isLoading}
              />
              <Button 
                onClick={handleSave}
                disabled={updateMutation.isPending || isLoading}
              >
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Recommended: 3-5 emails per day. This prevents contacts from receiving too many automated emails in a short time.
            </p>
          </div>

          <div className="pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">Current Configuration</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Daily Limit:</span>
                <span className="ml-2 font-medium">{maxEmailsPerDay} emails</span>
              </div>
              <div>
                <span className="text-muted-foreground">Default Cooldown:</span>
                <span className="ml-2 font-medium">3 days</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">How It Works</h4>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li>• Each contact can receive up to {maxEmailsPerDay} automation emails per day</li>
              <li>• Each rule has a 3-day cooldown before sending to the same contact again</li>
              <li>• Business hours enforcement can further restrict send times</li>
              <li>• Failed sends are automatically retried (up to 3 attempts)</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
