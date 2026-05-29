import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Trophy, Play, Square } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ABTestManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ruleId: string;
  orgId: string;
}

interface Variant {
  name: string;
  template_id: string;
  subject?: string;
  weight: number;
}

export function ABTestManager({ open, onOpenChange, ruleId, orgId }: ABTestManagerProps) {
  const queryClient = useQueryClient();
  const [testName, setTestName] = useState("");
  const [variants, setVariants] = useState<Variant[]>([
    { name: "Variant A", template_id: "", weight: 50 },
    { name: "Variant B", template_id: "", weight: 50 }
  ]);
  const [endDate, setEndDate] = useState<string>("");

  // Fetch templates
  const { data: templates } = useQuery({
    queryKey: ['email-templates', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('org_id', orgId)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  // Fetch existing A/B test
  const { data: existingTest, isLoading } = useQuery({
    queryKey: ['ab-test', ruleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('automation_ab_tests')
        .select('*')
        .eq('rule_id', ruleId)
        .maybeSingle();
      if (error) throw error;
      
      if (data) {
        setTestName(data.test_name);
        setVariants(data.variants as unknown as Variant[]);
        if (data.end_date) {
          setEndDate(new Date(data.end_date).toISOString().split('T')[0]);
        }
      }
      
      return data;
    },
    enabled: !!ruleId && open,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Validate
      if (!testName) throw new Error('Test name is required');
      if (variants.length < 2) throw new Error('At least 2 variants are required');
      if (variants.some(v => !v.template_id)) throw new Error('All variants must have a template');
      
      const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
      if (totalWeight !== 100) throw new Error('Variant weights must sum to 100%');

      const testData = {
        rule_id: ruleId,
        org_id: orgId,
        test_name: testName,
        variants: variants as unknown as any,
        status: 'active',
        end_date: endDate ? new Date(endDate).toISOString() : null,
      };

      if (existingTest) {
        const { error } = await supabase
          .from('automation_ab_tests')
          .update(testData)
          .eq('id', existingTest.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('automation_ab_tests')
          .insert(testData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ab-test'] });
      queryClient.invalidateQueries({ queryKey: ['email-automation-rules'] });
      toast.success('A/B test saved successfully');
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error('Failed to save A/B test: ' + error.message);
    },
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      if (!existingTest) throw new Error('No test to stop');
      
      const { error } = await supabase
        .from('automation_ab_tests')
        .update({ status: 'stopped' })
        .eq('id', existingTest.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ab-test'] });
      toast.success('A/B test stopped');
    },
    onError: (error: Error) => {
      toast.error('Failed to stop test: ' + error.message);
    },
  });

  const declareWinnerMutation = useMutation({
    mutationFn: async (winnerName: string) => {
      if (!existingTest) throw new Error('No test found');
      
      const { error } = await supabase
        .from('automation_ab_tests')
        .update({ 
          winner_variant: winnerName,
          status: 'completed'
        })
        .eq('id', existingTest.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ab-test'] });
      toast.success('Winner declared successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to declare winner: ' + error.message);
    },
  });

  const addVariant = () => {
    const newLetter = String.fromCharCode(65 + variants.length);
    setVariants([...variants, { 
      name: `Variant ${newLetter}`, 
      template_id: "", 
      weight: 0 
    }]);
  };

  const removeVariant = (index: number) => {
    if (variants.length <= 2) {
      toast.error('Must have at least 2 variants');
      return;
    }
    setVariants(variants.filter((_, i) => i !== index));
  };

  const updateVariant = (index: number, field: keyof Variant, value: any) => {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };
    setVariants(updated);
  };

  const distributeWeights = () => {
    const equalWeight = Math.floor(100 / variants.length);
    const remainder = 100 % variants.length;
    
    setVariants(variants.map((v, i) => ({
      ...v,
      weight: equalWeight + (i === 0 ? remainder : 0)
    })));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>A/B Test Manager</DialogTitle>
          <DialogDescription>
            Configure multiple email variants to test which performs best
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="testName">Test Name</Label>
              <Input
                id="testName"
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                placeholder="e.g., Subject Line Test, CTA Button Test"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">End Date (Optional)</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Leave empty for continuous testing
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Variants ({variants.length})</Label>
                <div className="flex gap-2">
                  <Button onClick={distributeWeights} variant="outline" size="sm">
                    Distribute Weights Evenly
                  </Button>
                  <Button onClick={addVariant} variant="outline" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Variant
                  </Button>
                </div>
              </div>

              {variants.map((variant, index) => (
                <Card key={index}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{variant.name}</CardTitle>
                      {variants.length > 2 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeVariant(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Template</Label>
                        <Select
                          value={variant.template_id}
                          onValueChange={(value) => updateVariant(index, 'template_id', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select template" />
                          </SelectTrigger>
                          <SelectContent>
                            {templates?.map((template) => (
                              <SelectItem key={template.id} value={template.id}>
                                {template.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Traffic Weight (%)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={variant.weight}
                          onChange={(e) => updateVariant(index, 'weight', parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Custom Subject (Optional)</Label>
                      <Input
                        value={variant.subject || ''}
                        onChange={(e) => updateVariant(index, 'subject', e.target.value)}
                        placeholder="Override template subject"
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}

              <div className="text-sm text-muted-foreground">
                Total weight: {variants.reduce((sum, v) => sum + v.weight, 0)}% 
                {variants.reduce((sum, v) => sum + v.weight, 0) !== 100 && (
                  <span className="text-destructive ml-2">(must equal 100%)</span>
                )}
              </div>
            </div>

            {existingTest && existingTest.status === 'active' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Test Actions</CardTitle>
                  <CardDescription>Manage your active A/B test</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-4">
                    <Button
                      variant="outline"
                      onClick={() => stopMutation.mutate()}
                      disabled={stopMutation.isPending}
                    >
                      <Square className="mr-2 h-4 w-4" />
                      Stop Test
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label>Declare Winner</Label>
                    <div className="flex gap-2">
                      {variants.map((variant) => (
                        <Button
                          key={variant.name}
                          variant="outline"
                          onClick={() => declareWinnerMutation.mutate(variant.name)}
                          disabled={declareWinnerMutation.isPending}
                        >
                          <Trophy className="mr-2 h-4 w-4" />
                          {variant.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {existingTest && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Status:</span>
                <Badge variant={existingTest.status === 'active' ? 'default' : 'secondary'}>
                  {existingTest.status}
                </Badge>
                {existingTest.winner_variant && (
                  <>
                    <span className="text-sm text-muted-foreground ml-4">Winner:</span>
                    <Badge variant="default">
                      <Trophy className="mr-1 h-3 w-3" />
                      {existingTest.winner_variant}
                    </Badge>
                  </>
                )}
              </div>
            )}

            <div className="flex justify-end gap-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                {existingTest ? 'Update' : 'Create'} Test
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
