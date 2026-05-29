import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { X, Plus } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface Condition {
  id: string;
  type: 'contact_field' | 'custom_field' | 'activity_history' | 'time_condition' | 'user_team';
  field?: string;
  field_name?: string;
  operator: string;
  value: string;
  activity_type?: string;
  days_ago?: number;
  time_type?: string;
  values?: string[];
  start_time?: string;
  end_time?: string;
  check_type?: string;
  user_ids?: string[];
  team_ids?: string[];
}

interface ConditionsBuilderProps {
  conditions: Condition[];
  conditionLogic: 'AND' | 'OR';
  onConditionsChange: (conditions: Condition[]) => void;
  onLogicChange: (logic: 'AND' | 'OR') => void;
  customFields: Array<{ id: string; field_name: string; field_type: string }>;
  users: Array<{ id: string; first_name: string; last_name: string }>;
  teams: Array<{ id: string; name: string }>;
}

const CONTACT_FIELDS = [
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'company', label: 'Company' },
  { value: 'job_title', label: 'Job Title' },
  { value: 'status', label: 'Status' },
  { value: 'source', label: 'Source' },
  { value: 'city', label: 'City' },
  { value: 'state', label: 'State' },
  { value: 'country', label: 'Country' },
];

const OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Does Not Contain' },
  { value: 'starts_with', label: 'Starts With' },
  { value: 'ends_with', label: 'Ends With' },
  { value: 'is_empty', label: 'Is Empty' },
  { value: 'is_not_empty', label: 'Is Not Empty' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'greater_than_or_equal', label: 'Greater Than or Equal' },
  { value: 'less_than_or_equal', label: 'Less Than or Equal' },
];

const ACTIVITY_TYPES = [
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'task', label: 'Task' },
  { value: 'note', label: 'Note' },
];

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function ConditionsBuilder({
  conditions,
  conditionLogic,
  onConditionsChange,
  onLogicChange,
  customFields,
  users,
  teams,
}: ConditionsBuilderProps) {
  const addCondition = () => {
    const newCondition: Condition = {
      id: `cond_${Date.now()}`,
      type: 'contact_field',
      field: 'first_name',
      operator: 'equals',
      value: '',
    };
    onConditionsChange([...conditions, newCondition]);
  };

  const removeCondition = (id: string) => {
    onConditionsChange(conditions.filter(c => c.id !== id));
  };

  const updateCondition = (id: string, updates: Partial<Condition>) => {
    onConditionsChange(
      conditions.map(c => (c.id === id ? { ...c, ...updates } : c))
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Conditions (Optional)</Label>
        <Button type="button" variant="outline" size="sm" onClick={addCondition}>
          <Plus className="h-4 w-4 mr-1" />
          Add Condition
        </Button>
      </div>

      {conditions.length > 1 && (
        <div className="space-y-2">
          <Label>Condition Logic</Label>
          <RadioGroup value={conditionLogic} onValueChange={(value) => onLogicChange(value as 'AND' | 'OR')}>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="AND" id="logic-and" />
                <Label htmlFor="logic-and" className="font-normal cursor-pointer">
                  Match ALL conditions (AND)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="OR" id="logic-or" />
                <Label htmlFor="logic-or" className="font-normal cursor-pointer">
                  Match ANY condition (OR)
                </Label>
              </div>
            </div>
          </RadioGroup>
        </div>
      )}

      <div className="space-y-3">
        {conditions.map((condition, index) => (
          <Card key={condition.id} className="p-4">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Condition Type</Label>
                    <Select
                      value={condition.type}
                      onValueChange={(value) => updateCondition(condition.id, { 
                        type: value as Condition['type'],
                        field: undefined,
                        field_name: undefined,
                        operator: 'equals',
                        value: '',
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contact_field">Contact Field</SelectItem>
                        <SelectItem value="custom_field">Custom Field</SelectItem>
                        <SelectItem value="activity_history">Activity History</SelectItem>
                        <SelectItem value="time_condition">Time Condition</SelectItem>
                        <SelectItem value="user_team">User/Team</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {condition.type === 'contact_field' && (
                    <>
                      <div>
                        <Label className="text-xs">Field</Label>
                        <Select
                          value={condition.field}
                          onValueChange={(value) => updateCondition(condition.id, { field: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONTACT_FIELDS.map(f => (
                              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Operator</Label>
                        <Select
                          value={condition.operator}
                          onValueChange={(value) => updateCondition(condition.id, { operator: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {OPERATORS.map(op => (
                              <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {condition.type === 'custom_field' && (
                    <>
                      <div>
                        <Label className="text-xs">Custom Field</Label>
                        <Select
                          value={condition.field_name}
                          onValueChange={(value) => updateCondition(condition.id, { field_name: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select field" />
                          </SelectTrigger>
                          <SelectContent>
                            {customFields.map(f => (
                              <SelectItem key={f.id} value={f.field_name}>{f.field_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Operator</Label>
                        <Select
                          value={condition.operator}
                          onValueChange={(value) => updateCondition(condition.id, { operator: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {OPERATORS.map(op => (
                              <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {condition.type === 'activity_history' && (
                    <>
                      <div>
                        <Label className="text-xs">Activity Type</Label>
                        <Select
                          value={condition.activity_type}
                          onValueChange={(value) => updateCondition(condition.id, { activity_type: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            {ACTIVITY_TYPES.map(at => (
                              <SelectItem key={at.value} value={at.value}>{at.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Operator</Label>
                        <Select
                          value={condition.operator}
                          onValueChange={(value) => updateCondition(condition.id, { operator: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="greater_than">More Than</SelectItem>
                            <SelectItem value="less_than">Less Than</SelectItem>
                            <SelectItem value="equals">Exactly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {condition.type === 'time_condition' && (
                    <>
                      <div>
                        <Label className="text-xs">Time Type</Label>
                        <Select
                          value={condition.time_type}
                          onValueChange={(value) => updateCondition(condition.id, { time_type: value, values: [] })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="day_of_week">Day of Week</SelectItem>
                            <SelectItem value="time_of_day">Time of Day</SelectItem>
                            <SelectItem value="month">Month</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {condition.type === 'user_team' && (
                    <>
                      <div>
                        <Label className="text-xs">Check Type</Label>
                        <Select
                          value={condition.check_type}
                          onValueChange={(value) => updateCondition(condition.id, { check_type: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="assigned_user">Assigned User</SelectItem>
                            <SelectItem value="assigned_team">Assigned Team</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-5"
                  onClick={() => removeCondition(condition.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Value inputs based on condition type */}
              {(condition.type === 'contact_field' || condition.type === 'custom_field') && 
                !['is_empty', 'is_not_empty'].includes(condition.operator) && (
                <div>
                  <Label className="text-xs">Value</Label>
                  <Input
                    value={condition.value}
                    onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                    placeholder="Enter value"
                  />
                </div>
              )}

              {condition.type === 'activity_history' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Count</Label>
                    <Input
                      type="number"
                      value={condition.value}
                      onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">In Last (Days)</Label>
                    <Input
                      type="number"
                      value={condition.days_ago || 30}
                      onChange={(e) => updateCondition(condition.id, { days_ago: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
              )}

              {condition.type === 'time_condition' && condition.time_type === 'day_of_week' && (
                <div>
                  <Label className="text-xs">Select Days</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {DAYS_OF_WEEK.map(day => (
                      <Button
                        key={day}
                        type="button"
                        variant={condition.values?.includes(day) ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          const current = condition.values || [];
                          const updated = current.includes(day)
                            ? current.filter(d => d !== day)
                            : [...current, day];
                          updateCondition(condition.id, { values: updated });
                        }}
                      >
                        {day}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {condition.type === 'time_condition' && condition.time_type === 'time_of_day' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Start Time</Label>
                    <Input
                      type="time"
                      value={condition.start_time || '09:00'}
                      onChange={(e) => updateCondition(condition.id, { start_time: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">End Time</Label>
                    <Input
                      type="time"
                      value={condition.end_time || '17:00'}
                      onChange={(e) => updateCondition(condition.id, { end_time: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {condition.type === 'time_condition' && condition.time_type === 'month' && (
                <div>
                  <Label className="text-xs">Select Months</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {MONTHS.map(month => (
                      <Button
                        key={month}
                        type="button"
                        variant={condition.values?.includes(month) ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          const current = condition.values || [];
                          const updated = current.includes(month)
                            ? current.filter(m => m !== month)
                            : [...current, month];
                          updateCondition(condition.id, { values: updated });
                        }}
                      >
                        {month}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {conditions.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No conditions added. Rule will trigger for all matching contacts.
        </div>
      )}
    </div>
  );
}
