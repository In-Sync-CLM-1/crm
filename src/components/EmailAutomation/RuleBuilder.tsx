import { useState, useEffect } from "react";
import { ConditionsBuilder } from "./ConditionsBuilder";
import { ABTestManager } from "./ABTestManager";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useNotification } from "@/hooks/useNotification";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface RuleBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingRule?: any;
}

type TriggerType = "stage_change" | "disposition_set" | "activity_logged" | "field_updated" | "inactivity" | "time_based" | "assignment_changed" | "email_engagement" | "lead_score_change" | "tag_assigned" | "form_submitted";

export function RuleBuilder({ open, onOpenChange, editingRule }: RuleBuilderProps) {
  const { effectiveOrgId } = useOrgContext();
  const notify = useNotification();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState<TriggerType>("stage_change");
  const [templateId, setTemplateId] = useState("");
  const [sendDelayMinutes, setSendDelayMinutes] = useState(0);
  const [maxSends, setMaxSends] = useState<number | undefined>();
  const [cooldownDays, setCooldownDays] = useState<number | undefined>();
  const [priority, setPriority] = useState(50);
  const [conditions, setConditions] = useState<any[]>([]);
  const [conditionLogic, setConditionLogic] = useState<'AND' | 'OR'>('AND');

  // Stage change config
  const [fromStageId, setFromStageId] = useState<string | undefined>();
  const [toStageId, setToStageId] = useState<string | undefined>();

  // Disposition config
  const [dispositionIds, setDispositionIds] = useState<string[]>([]);

  // Activity logged config
  const [activityTypes, setActivityTypes] = useState<string[]>([]);
  const [minCallDuration, setMinCallDuration] = useState<number | undefined>();

  // Field updated config
  const [customFieldId, setCustomFieldId] = useState<string | undefined>();
  const [valueThreshold, setValueThreshold] = useState("");

  // Inactivity config
  const [inactivityDays, setInactivityDays] = useState(30);

  // Time based config
  const [relativeDays, setRelativeDays] = useState(0);

  // Assignment config
  const [assignedToUserIds, setAssignedToUserIds] = useState<string[]>([]);

  // Email engagement config
  const [engagementType, setEngagementType] = useState<string>("either");
  const [withinHours, setWithinHours] = useState<number | undefined>();

  // Advanced features
  const [enforceBusinessHours, setEnforceBusinessHours] = useState(false);
  const [abTestEnabled, setAbTestEnabled] = useState(false);
  const [showAbTestManager, setShowAbTestManager] = useState(false);

  // Fetch pipeline stages
  const { data: stages } = useQuery({
    queryKey: ["pipeline_stages", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("org_id", effectiveOrgId)
        .order("stage_order");
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId,
  });

  // Fetch dispositions
  const { data: dispositions } = useQuery({
    queryKey: ["call_dispositions", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("call_dispositions")
        .select("*")
        .eq("org_id", effectiveOrgId)
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId,
  });

  // Fetch custom fields
  const { data: customFields } = useQuery({
    queryKey: ["custom_fields", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("custom_fields")
        .select("*")
        .eq("org_id", effectiveOrgId)
        .eq("applies_to_table", "contacts")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId,
  });

  // Fetch users
  const { data: users } = useQuery({
    queryKey: ["profiles", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("org_id", effectiveOrgId);
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId,
  });

  // Fetch templates
  const { data: templates } = useQuery({
    queryKey: ["email_templates", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .eq("org_id", effectiveOrgId)
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId,
  });

  // Load editing rule data
  useEffect(() => {
    if (editingRule) {
      setName(editingRule.name);
      setDescription(editingRule.description || "");
      setTriggerType(editingRule.trigger_type);
      setTemplateId(editingRule.email_template_id || "");
      setSendDelayMinutes(editingRule.send_delay_minutes || 0);
      setMaxSends(editingRule.max_sends_per_contact);
      setCooldownDays(editingRule.cooldown_period_days);
      setPriority(editingRule.priority || 50);

      const config = editingRule.trigger_config || {};
      setFromStageId(config.from_stage_id);
      setToStageId(config.to_stage_id);
      setDispositionIds(config.disposition_ids || []);
      setActivityTypes(config.activity_types || []);
      setMinCallDuration(config.min_call_duration_seconds);
      setCustomFieldId(config.field_id);
      setValueThreshold(config.value_threshold || "");
      setInactivityDays(config.inactivity_days || 30);
      setRelativeDays(config.relative_days || 0);
      setAssignedToUserIds(config.assigned_to_user_ids || []);
      setEngagementType(config.engagement_type || "either");
      setWithinHours(config.within_hours);
      setConditions(editingRule.conditions || []);
      setConditionLogic(editingRule.condition_logic || 'AND');
      setEnforceBusinessHours(editingRule.enforce_business_hours || false);
      setAbTestEnabled(editingRule.ab_test_enabled || false);
    } else {
      resetForm();
    }
  }, [editingRule, open]);

  const resetForm = () => {
    setName("");
    setDescription("");
    setTriggerType("stage_change");
    setTemplateId("");
    setSendDelayMinutes(0);
    setMaxSends(undefined);
    setCooldownDays(undefined);
    setPriority(50);
    setFromStageId(undefined);
    setToStageId(undefined);
    setDispositionIds([]);
    setActivityTypes([]);
    setMinCallDuration(undefined);
    setCustomFieldId(undefined);
    setValueThreshold("");
    setInactivityDays(30);
    setRelativeDays(0);
    setAssignedToUserIds([]);
    setEngagementType("either");
    setWithinHours(undefined);
    setConditions([]);
    setConditionLogic('AND');
    setEnforceBusinessHours(false);
    setAbTestEnabled(false);
  };

  // Save rule mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveOrgId) throw new Error("No organization selected");

      let triggerConfig = {};
      if (triggerType === "stage_change") {
        triggerConfig = { from_stage_id: fromStageId, to_stage_id: toStageId };
      } else if (triggerType === "disposition_set") {
        triggerConfig = { disposition_ids: dispositionIds };
      } else if (triggerType === "activity_logged") {
        triggerConfig = { 
          activity_types: activityTypes,
          min_call_duration_seconds: minCallDuration
        };
      } else if (triggerType === "field_updated") {
        triggerConfig = { 
          field_id: customFieldId,
          value_threshold: valueThreshold
        };
      } else if (triggerType === "inactivity") {
        triggerConfig = { inactivity_days: inactivityDays };
      } else if (triggerType === "time_based") {
        triggerConfig = { 
          trigger_date_type: "contact_created",
          relative_days: relativeDays
        };
      } else if (triggerType === "assignment_changed") {
        triggerConfig = { assigned_to_user_ids: assignedToUserIds };
      } else if (triggerType === "email_engagement") {
        triggerConfig = { 
          engagement_type: engagementType === "either" ? undefined : engagementType,
          within_hours: withinHours
        };
      }

      const ruleData = {
        org_id: effectiveOrgId,
        name,
        description,
        trigger_type: triggerType,
        trigger_config: triggerConfig,
        email_template_id: templateId || null,
        send_delay_minutes: sendDelayMinutes,
        max_sends_per_contact: maxSends,
        cooldown_period_days: cooldownDays,
        priority,
        conditions,
        condition_logic: conditionLogic,
        enforce_business_hours: enforceBusinessHours,
        ab_test_enabled: abTestEnabled,
        is_active: true,
      };

      if (editingRule) {
        const { error } = await supabase
          .from("email_automation_rules")
          .update(ruleData)
          .eq("id", editingRule.id);
        if (error) throw error;
      } else {
        const { data: user } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("email_automation_rules")
          .insert({ ...ruleData, created_by: user.user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email_automation_rules"] });
      const title = editingRule ? "Rule updated" : "Rule created";
      notify.success(title, "Automation rule saved successfully");
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      notify.error("Error", error);
    },
  });

  const handleSave = () => {
    if (!name) {
      notify.error("Validation Error", new Error("Please provide a rule name"));
      return;
    }

    if (!templateId) {
      notify.error("Validation Error", new Error("Please select an email template"));
      return;
    }

    saveMutation.mutate();
  };

  const getTriggerLabel = (type: TriggerType) => {
    const labels: Record<TriggerType, string> = {
      stage_change: "Stage Change",
      disposition_set: "Call Disposition",
      activity_logged: "Activity Logged",
      field_updated: "Field Updated",
      inactivity: "Contact Inactivity",
      time_based: "Time Based",
      assignment_changed: "Assignment Changed",
      email_engagement: "Email Engagement",
      lead_score_change: "Lead Score Change",
      tag_assigned: "Tag Assigned",
      form_submitted: "Form Submitted",
    };
    return labels[type];
  };

  const toggleActivityType = (type: string) => {
    if (activityTypes.includes(type)) {
      setActivityTypes(activityTypes.filter(t => t !== type));
    } else {
      setActivityTypes([...activityTypes, type]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingRule ? "Edit Automation Rule" : "Create Automation Rule"}
          </DialogTitle>
          <DialogDescription>
            Set up automated emails based on pipeline changes and activities
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Basic Info */}
          <div className="space-y-2">
            <Label htmlFor="name">Rule Name *</Label>
            <Input
              id="name"
              placeholder="e.g., New Lead Welcome Email"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe what this rule does..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Trigger Type */}
          <div className="space-y-2">
            <Label htmlFor="trigger">Trigger Type *</Label>
            <Select value={triggerType} onValueChange={(v: TriggerType) => setTriggerType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["stage_change", "disposition_set", "activity_logged", "field_updated", "inactivity", "time_based", "assignment_changed", "email_engagement", "lead_score_change", "tag_assigned", "form_submitted"] as TriggerType[]).map(type => (
                  <SelectItem key={type} value={type}>
                    {getTriggerLabel(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Stage Change Config */}
          {triggerType === "stage_change" && (
            <div className="space-y-2 border rounded-lg p-4 bg-muted/50">
              <Label>Stage Configuration</Label>
              <p className="text-sm text-muted-foreground">
                Select stages to trigger this rule (leave blank for "any")
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>From Stage</Label>
                  <Select value={fromStageId || "any"} onValueChange={(v) => setFromStageId(v === "any" ? undefined : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Any stage" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any stage</SelectItem>
                      {stages?.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>To Stage</Label>
                  <Select value={toStageId || "any"} onValueChange={(v) => setToStageId(v === "any" ? undefined : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Any stage" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any stage</SelectItem>
                      {stages?.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Disposition Config */}
          {triggerType === "disposition_set" && (
            <div className="space-y-2 border rounded-lg p-4 bg-muted/50">
              <Label>Disposition Selection *</Label>
              <p className="text-sm text-muted-foreground">
                Select which dispositions trigger this rule
              </p>
              <Select
                value={dispositionIds[0] || ""}
                onValueChange={(v) => setDispositionIds([v])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select disposition" />
                </SelectTrigger>
                <SelectContent>
                  {dispositions?.map((disp) => (
                    <SelectItem key={disp.id} value={disp.id}>
                      {disp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Activity Logged Config */}
          {triggerType === "activity_logged" && (
            <div className="space-y-3 border rounded-lg p-4 bg-muted/50">
              <Label>Activity Configuration</Label>
              <p className="text-sm text-muted-foreground">
                Select which activity types trigger this rule
              </p>
              <div className="space-y-2">
                {["call", "meeting", "email", "note", "task"].map(type => (
                  <div key={type} className="flex items-center space-x-2">
                    <Checkbox
                      id={type}
                      checked={activityTypes.includes(type)}
                      onCheckedChange={() => toggleActivityType(type)}
                    />
                    <Label htmlFor={type} className="capitalize cursor-pointer">
                      {type}
                    </Label>
                  </div>
                ))}
              </div>
              <div className="space-y-2 pt-2">
                <Label>Minimum Call Duration (seconds)</Label>
                <Input
                  type="number"
                  placeholder="Optional, e.g., 300 for 5 minutes"
                  value={minCallDuration || ""}
                  onChange={(e) => setMinCallDuration(e.target.value ? parseInt(e.target.value) : undefined)}
                />
              </div>
            </div>
          )}

          {/* Field Updated Config */}
          {triggerType === "field_updated" && (
            <div className="space-y-3 border rounded-lg p-4 bg-muted/50">
              <Label>Field Configuration</Label>
              <p className="text-sm text-muted-foreground">
                Trigger when a custom field changes
              </p>
              <div className="space-y-2">
                <Label>Custom Field *</Label>
                <Select value={customFieldId || ""} onValueChange={setCustomFieldId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select field" />
                  </SelectTrigger>
                  <SelectContent>
                    {customFields?.map((field) => (
                      <SelectItem key={field.id} value={field.id}>
                        {field.field_label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Value Threshold (optional)</Label>
                <Input
                  placeholder="e.g., >50000 or <100"
                  value={valueThreshold}
                  onChange={(e) => setValueThreshold(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  For numeric fields only. Examples: &gt;50000, &lt;100
                </p>
              </div>
            </div>
          )}

          {/* Inactivity Config */}
          {triggerType === "inactivity" && (
            <div className="space-y-3 border rounded-lg p-4 bg-muted/50">
              <Label>Inactivity Configuration</Label>
              <p className="text-sm text-muted-foreground">
                Trigger when contact has no activity for specified days
              </p>
              <div className="space-y-2">
                <Label>Inactivity Days *</Label>
                <Input
                  type="number"
                  min="1"
                  value={inactivityDays}
                  onChange={(e) => setInactivityDays(parseInt(e.target.value) || 30)}
                />
                <p className="text-xs text-muted-foreground">
                  Checked daily at 9 AM
                </p>
              </div>
            </div>
          )}

          {/* Time Based Config */}
          {triggerType === "time_based" && (
            <div className="space-y-3 border rounded-lg p-4 bg-muted/50">
              <Label>Time-Based Configuration</Label>
              <p className="text-sm text-muted-foreground">
                Trigger X days after contact created
              </p>
              <div className="space-y-2">
                <Label>Days After Contact Created *</Label>
                <Input
                  type="number"
                  min="0"
                  value={relativeDays}
                  onChange={(e) => setRelativeDays(parseInt(e.target.value) || 0)}
                />
                <p className="text-xs text-muted-foreground">
                  0 = same day, 7 = one week later, etc.
                </p>
              </div>
            </div>
          )}

          {/* Assignment Changed Config */}
          {triggerType === "assignment_changed" && (
            <div className="space-y-3 border rounded-lg p-4 bg-muted/50">
              <Label>Assignment Configuration</Label>
              <p className="text-sm text-muted-foreground">
                Trigger when contact is assigned to specific users (optional filter)
              </p>
              <div className="space-y-2">
                <Label>Assigned To User (optional)</Label>
                <Select 
                  value={assignedToUserIds[0] || "any"} 
                  onValueChange={(v) => setAssignedToUserIds(v === "any" ? [] : [v])}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any user" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any user</SelectItem>
                    {users?.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.first_name} {user.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Email Engagement Config */}
          {triggerType === "email_engagement" && (
            <div className="space-y-3 border rounded-lg p-4 bg-muted/50">
              <Label>Email Engagement Configuration</Label>
              <p className="text-sm text-muted-foreground">
                Trigger when recipients interact with automated emails
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Engagement Type *</Label>
                  <Select value={engagementType} onValueChange={setEngagementType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="opened">Opened Email</SelectItem>
                      <SelectItem value="clicked">Clicked Link</SelectItem>
                      <SelectItem value="either">Either (Open or Click)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Within Timeframe (hours)</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="Any time"
                    value={withinHours || ""}
                    onChange={(e) => setWithinHours(e.target.value ? parseInt(e.target.value) : undefined)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank for any time
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Lead Score Change Config */}
          {triggerType === "lead_score_change" && (
            <div className="space-y-3 border rounded-lg p-4 bg-muted/50">
              <Label>Lead Score Configuration</Label>
              <p className="text-sm text-muted-foreground">
                Trigger when contact's lead score crosses thresholds
              </p>
              <div className="space-y-2">
                <Label>Score Threshold</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="e.g., 70 for 'hot' leads"
                  value={conditions.find(c => c.field === 'score')?.value || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setConditions([
                      { field: 'new_score', operator: 'greater_than', value: val }
                    ]);
                  }}
                />
              </div>
            </div>
          )}

          {/* Tag Assigned Config */}
          {triggerType === "tag_assigned" && (
            <div className="space-y-3 border rounded-lg p-4 bg-muted/50">
              <Label>Tag Configuration</Label>
              <p className="text-sm text-muted-foreground">
                Trigger when specific tags are assigned to contacts
              </p>
              <div className="text-sm text-muted-foreground">
                Use the Conditions builder below to specify which tags trigger this rule
              </div>
            </div>
          )}

          {/* Form Submitted Config */}
          {triggerType === "form_submitted" && (
            <div className="space-y-3 border rounded-lg p-4 bg-muted/50">
              <Label>Form Configuration</Label>
              <p className="text-sm text-muted-foreground">
                Trigger when specific forms are submitted
              </p>
              <div className="text-sm text-muted-foreground">
                Use the Conditions builder below to specify which forms trigger this rule
              </div>
            </div>
          )}

          {/* Conditions Section */}
          <div className="space-y-3 border rounded-lg p-4 bg-muted/50">
            <ConditionsBuilder
              conditions={conditions}
              conditionLogic={conditionLogic}
              onConditionsChange={setConditions}
              onLogicChange={setConditionLogic}
              customFields={customFields || []}
              users={users || []}
              teams={[]}
            />
          </div>

          {/* Email Template */}
          <div className="space-y-2">
            <Label htmlFor="template">Email Template *</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
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

          {/* Timing */}
          <div className="space-y-2">
            <Label htmlFor="delay">Send Delay (minutes)</Label>
            <Input
              id="delay"
              type="number"
              min="0"
              value={sendDelayMinutes}
              onChange={(e) => setSendDelayMinutes(parseInt(e.target.value) || 0)}
            />
            <p className="text-sm text-muted-foreground">
              0 = send immediately, 60 = send 1 hour after trigger
            </p>
          </div>

          {/* Frequency Control */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="maxSends">Max Sends per Contact</Label>
              <Input
                id="maxSends"
                type="number"
                min="1"
                placeholder="Unlimited"
                value={maxSends || ""}
                onChange={(e) =>
                  setMaxSends(e.target.value ? parseInt(e.target.value) : undefined)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cooldown">Cooldown (days)</Label>
              <Input
                id="cooldown"
                type="number"
                min="1"
                placeholder="No cooldown"
                value={cooldownDays || ""}
                onChange={(e) =>
                  setCooldownDays(e.target.value ? parseInt(e.target.value) : undefined)
                }
              />
            </div>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label htmlFor="priority">Priority (0-100)</Label>
            <Input
              id="priority"
              type="number"
              min="0"
              max="100"
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value) || 50)}
            />
            <p className="text-sm text-muted-foreground">
              Higher priority rules execute first when multiple rules match
            </p>
          </div>

          {/* Advanced Features */}
          <div className="space-y-4 border rounded-lg p-4 bg-muted/50">
            <h3 className="font-semibold">Advanced Features</h3>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="businessHours"
                checked={enforceBusinessHours}
                onCheckedChange={(checked) => setEnforceBusinessHours(checked as boolean)}
              />
              <Label htmlFor="businessHours" className="cursor-pointer">
                Enforce business hours
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="abTest"
                checked={abTestEnabled}
                onCheckedChange={(checked) => setAbTestEnabled(checked as boolean)}
              />
              <Label htmlFor="abTest" className="cursor-pointer">
                Enable A/B testing
              </Label>
            </div>

            {abTestEnabled && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAbTestManager(true)}
                className="w-full"
              >
                Configure A/B Test
              </Button>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : editingRule ? "Update Rule" : "Create Rule"}
          </Button>
        </div>
      </DialogContent>

      {editingRule && (
        <ABTestManager
          open={showAbTestManager}
          onOpenChange={setShowAbTestManager}
          ruleId={editingRule.id}
          orgId={effectiveOrgId || ""}
        />
      )}
    </Dialog>
  );
}
