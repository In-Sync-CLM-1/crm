import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, ArrowRight, AlertTriangle, GitBranch } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface RuleDependencyManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ruleId: string;
  orgId: string;
}

export function RuleDependencyManager({ 
  open, 
  onOpenChange, 
  ruleId, 
  orgId 
}: RuleDependencyManagerProps) {
  const queryClient = useQueryClient();
  const [selectedRuleId, setSelectedRuleId] = useState("");
  const [dependencyType, setDependencyType] = useState<"required" | "blocks" | "triggers">("required");
  const [delayMinutes, setDelayMinutes] = useState(0);

  // Fetch all rules in org
  const { data: allRules } = useQuery({
    queryKey: ['email-automation-rules', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_automation_rules')
        .select('id, name, trigger_type, is_active')
        .eq('org_id', orgId)
        .neq('id', ruleId)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!orgId && open,
  });

  // Fetch existing dependencies
  const { data: dependencies, isLoading } = useQuery({
    queryKey: ['email-automation-rule-dependencies', ruleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_automation_rule_dependencies')
        .select(`
          *,
          depends_on_rule:email_automation_rules!email_automation_rule_dependencies_depends_on_rule_id_fkey(
            id,
            name,
            trigger_type
          )
        `)
        .eq('rule_id', ruleId);
      if (error) throw error;
      return data;
    },
    enabled: !!ruleId && open,
  });

  const addDependencyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRuleId) {
        throw new Error('Please select a rule');
      }

      // Check for circular dependency
      const { data: hasCircular, error: circularError } = await supabase.rpc(
        'check_circular_dependency',
        {
          _rule_id: ruleId,
          _depends_on_rule_id: selectedRuleId,
        }
      );

      if (circularError) throw circularError;
      
      if (hasCircular) {
        throw new Error('This would create a circular dependency');
      }

      // Add dependency
      const { error } = await supabase
        .from('email_automation_rule_dependencies')
        .insert({
          rule_id: ruleId,
          depends_on_rule_id: selectedRuleId,
          dependency_type: dependencyType,
          delay_minutes: delayMinutes,
          org_id: orgId,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-automation-rule-dependencies'] });
      toast.success('Dependency added successfully');
      setSelectedRuleId("");
      setDelayMinutes(0);
    },
    onError: (error: Error) => {
      toast.error('Failed to add dependency: ' + error.message);
    },
  });

  const deleteDependencyMutation = useMutation({
    mutationFn: async (dependencyId: string) => {
      const { error } = await supabase
        .from('email_automation_rule_dependencies')
        .delete()
        .eq('id', dependencyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-automation-rule-dependencies'] });
      toast.success('Dependency removed');
    },
    onError: (error: Error) => {
      toast.error('Failed to remove dependency: ' + error.message);
    },
  });

  const getDependencyTypeColor = (type: string) => {
    switch (type) {
      case 'required': return 'default';
      case 'blocks': return 'destructive';
      case 'triggers': return 'secondary';
      default: return 'outline';
    }
  };

  const getDependencyTypeDescription = (type: string) => {
    switch (type) {
      case 'required':
        return 'This rule will only execute after the dependency completes';
      case 'blocks':
        return 'This rule will prevent the dependency from executing';
      case 'triggers':
        return 'This rule will trigger the dependency to execute';
      default:
        return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Rule Dependencies
          </DialogTitle>
          <DialogDescription>
            Control the execution order and relationships between automation rules
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-6">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Dependencies create execution chains. Ensure they don't create circular loops.
              </AlertDescription>
            </Alert>

            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label>Depends On Rule</Label>
                  <Select value={selectedRuleId} onValueChange={setSelectedRuleId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a rule" />
                    </SelectTrigger>
                    <SelectContent>
                      {allRules?.map((rule) => (
                        <SelectItem key={rule.id} value={rule.id}>
                          {rule.name} ({rule.trigger_type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Dependency Type</Label>
                  <Select 
                    value={dependencyType} 
                    onValueChange={(value: any) => setDependencyType(value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="required">
                        Required - Wait for completion
                      </SelectItem>
                      <SelectItem value="blocks">
                        Blocks - Prevent execution
                      </SelectItem>
                      <SelectItem value="triggers">
                        Triggers - Start execution
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {getDependencyTypeDescription(dependencyType)}
                  </p>
                </div>

                {dependencyType === 'required' && (
                  <div className="space-y-2">
                    <Label>Minimum Delay (minutes)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={delayMinutes}
                      onChange={(e) => setDelayMinutes(parseInt(e.target.value) || 0)}
                      placeholder="0"
                    />
                    <p className="text-xs text-muted-foreground">
                      Wait this long after dependency completes before executing
                    </p>
                  </div>
                )}

                <Button
                  onClick={() => addDependencyMutation.mutate()}
                  disabled={!selectedRuleId || addDependencyMutation.isPending}
                  className="w-full"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Dependency
                </Button>
              </CardContent>
            </Card>

            {dependencies && dependencies.length > 0 && (
              <div className="space-y-3">
                <Label className="text-base">Current Dependencies ({dependencies.length})</Label>
                {dependencies.map((dep) => (
                  <Card key={dep.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <Badge variant={getDependencyTypeColor(dep.dependency_type)}>
                            {dep.dependency_type}
                          </Badge>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium">
                              {dep.depends_on_rule?.name || 'Unknown Rule'}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {dep.depends_on_rule?.trigger_type}
                            </div>
                          </div>
                          {dep.delay_minutes > 0 && (
                            <Badge variant="outline" className="ml-auto">
                              +{dep.delay_minutes}m delay
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteDependencyMutation.mutate(dep.id)}
                          disabled={deleteDependencyMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {dependencies && dependencies.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <GitBranch className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>No dependencies configured</p>
                <p className="text-sm mt-1">
                  This rule will execute independently
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
