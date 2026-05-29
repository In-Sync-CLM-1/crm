import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNotification } from "@/hooks/useNotification";
import { Clock, Save } from "lucide-react";

const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Australia/Sydney",
];

interface BusinessHour {
  id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_enabled: boolean;
  timezone: string;
}

export function BusinessHoursConfig() {
  const { effectiveOrgId } = useOrgContext();
  const notify = useNotification();
  const queryClient = useQueryClient();
  const [timezone, setTimezone] = useState("UTC");

  const { data: businessHours, isLoading } = useQuery({
    queryKey: ["business_hours", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("org_business_hours")
        .select("*")
        .eq("org_id", effectiveOrgId)
        .order("day_of_week");
      if (error) throw error;
      if (data.length > 0) setTimezone(data[0].timezone);
      return data;
    },
    enabled: !!effectiveOrgId,
  });

  const saveMutation = useMutation({
    mutationFn: async (hours: BusinessHour[]) => {
      if (!effectiveOrgId) throw new Error("No org ID");

      // Delete existing hours
      await supabase
        .from("org_business_hours")
        .delete()
        .eq("org_id", effectiveOrgId);

      // Insert new hours
      const { error } = await supabase.from("org_business_hours").insert(
        hours.map((h) => ({
          org_id: effectiveOrgId,
          day_of_week: h.day_of_week,
          start_time: h.start_time,
          end_time: h.end_time,
          is_enabled: h.is_enabled,
          timezone,
        }))
      );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business_hours"] });
      notify.success("Business hours saved", "Your business hours configuration has been updated");
    },
    onError: (error: any) => {
      notify.error("Error", error);
    },
  });

  const [localHours, setLocalHours] = useState<Record<number, BusinessHour>>({});

  const initializeDefaultHours = () => {
    const defaults: Record<number, BusinessHour> = {};
    DAYS_OF_WEEK.forEach((day) => {
      const existing = businessHours?.find((h) => h.day_of_week === day.value);
      defaults[day.value] = existing || {
        day_of_week: day.value,
        start_time: "09:00",
        end_time: "17:00",
        is_enabled: day.value >= 1 && day.value <= 5, // Monday-Friday enabled by default
        timezone,
      };
    });
    setLocalHours(defaults);
  };

  if (!Object.keys(localHours).length && businessHours) {
    initializeDefaultHours();
  }

  const handleSave = () => {
    const hoursArray = Object.values(localHours);
    saveMutation.mutate(hoursArray);
  };

  const updateHour = (day: number, field: keyof BusinessHour, value: any) => {
    setLocalHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  };

  if (isLoading) {
    return <div>Loading business hours...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Business Hours Configuration
        </CardTitle>
        <CardDescription>
          Set your organization's business hours. Emails will be queued outside these hours if enforcement is enabled.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Timezone</Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-4">
          {DAYS_OF_WEEK.map((day) => {
            const hour = localHours[day.value];
            if (!hour) return null;

            return (
              <div key={day.value} className="flex items-center gap-4 border-b pb-4">
                <div className="w-32">
                  <Switch
                    checked={hour.is_enabled}
                    onCheckedChange={(checked) => updateHour(day.value, "is_enabled", checked)}
                  />
                  <Label className="ml-2">{day.label}</Label>
                </div>

                {hour.is_enabled && (
                  <>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">From</Label>
                      <Input
                        type="time"
                        value={hour.start_time}
                        onChange={(e) => updateHour(day.value, "start_time", e.target.value)}
                        className="w-32"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">To</Label>
                      <Input
                        type="time"
                        value={hour.end_time}
                        onChange={(e) => updateHour(day.value, "end_time", e.target.value)}
                        className="w-32"
                      />
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          <Save className="mr-2 h-4 w-4" />
          {saveMutation.isPending ? "Saving..." : "Save Business Hours"}
        </Button>
      </CardContent>
    </Card>
  );
}
