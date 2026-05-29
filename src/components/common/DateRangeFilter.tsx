import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon } from "lucide-react";
import { format, startOfWeek, startOfMonth, startOfQuarter, endOfQuarter, startOfYear, subMonths, subQuarters, endOfMonth, subDays } from "date-fns";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";

export type DateRangePreset = 
  | "today"
  | "this_week" 
  | "this_month" 
  | "this_quarter" 
  | "this_year" 
  | "last_7_days"
  | "last_30_days"
  | "last_90_days"
  | "last_month" 
  | "last_quarter" 
  | "custom";

interface DateRangeFilterProps {
  value: { from: Date; to: Date };
  onChange: (range: { from: Date; to: Date }) => void;
  preset?: DateRangePreset;
  onPresetChange?: (preset: DateRangePreset) => void;
  /** Which presets to show. Defaults to all */
  presets?: DateRangePreset[];
  /** Compact mode shows only the date range, no preset selector */
  compact?: boolean;
  className?: string;
}

const presetLabels: Record<DateRangePreset, string> = {
  today: "Today",
  this_week: "This Week",
  this_month: "This Month",
  this_quarter: "This Quarter",
  this_year: "This Year (YTD)",
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  last_90_days: "Last 90 days",
  last_month: "Last Month",
  last_quarter: "Last Quarter",
  custom: "Custom Range",
};

export function getDateRangeFromPreset(preset: DateRangePreset, customRange?: { from: Date; to: Date }): { from: Date; to: Date } {
  const now = new Date();
  
  switch (preset) {
    case "today":
      return { from: now, to: now };
    case "this_week":
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: now };
    case "this_month":
      return { from: startOfMonth(now), to: now };
    case "this_quarter":
      return { from: startOfQuarter(now), to: now };
    case "this_year":
      return { from: startOfYear(now), to: now };
    case "last_7_days":
      return { from: subDays(now, 7), to: now };
    case "last_30_days":
      return { from: subDays(now, 30), to: now };
    case "last_90_days":
      return { from: subDays(now, 90), to: now };
    case "last_month": {
      const lastMonth = subMonths(now, 1);
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
    }
    case "last_quarter": {
      const lastQuarter = subQuarters(now, 1);
      return { from: startOfQuarter(lastQuarter), to: endOfQuarter(lastQuarter) };
    }
    case "custom":
      return customRange || { from: startOfMonth(now), to: now };
    default:
      return { from: startOfMonth(now), to: now };
  }
}

const defaultPresets: DateRangePreset[] = [
  "this_week",
  "this_month",
  "this_quarter",
  "this_year",
  "last_month",
  "last_quarter",
  "custom",
];

export default function DateRangeFilter({ 
  value, 
  onChange, 
  preset,
  onPresetChange,
  presets = defaultPresets,
  compact = false,
  className,
}: DateRangeFilterProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [internalPreset, setInternalPreset] = useState<DateRangePreset>(preset || "this_month");

  const activePreset = preset ?? internalPreset;

  const handlePresetChange = (newPreset: DateRangePreset) => {
    if (onPresetChange) {
      onPresetChange(newPreset);
    } else {
      setInternalPreset(newPreset);
    }
    
    if (newPreset !== "custom") {
      const range = getDateRangeFromPreset(newPreset);
      onChange(range);
    }
  };

  const handleCustomRangeSelect = (range: DateRange | undefined) => {
    if (range?.from && range?.to) {
      onChange({ from: range.from, to: range.to });
      setIsCalendarOpen(false);
    }
  };

  // Compact mode - just calendar picker
  if (compact) {
    return (
      <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("w-[280px] justify-start text-left font-normal", className)}>
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value?.from ? (
              value.to ? (
                <>
                  {format(value.from, "LLL dd, y")} - {format(value.to, "LLL dd, y")}
                </>
              ) : (
                format(value.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={value?.from}
            selected={{ from: value.from, to: value.to }}
            onSelect={handleCustomRangeSelect}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    );
  }

  // Full mode with preset selector
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Select value={activePreset} onValueChange={(val) => handlePresetChange(val as DateRangePreset)}>
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder="Select period" />
        </SelectTrigger>
        <SelectContent>
          {presets.map((p) => (
            <SelectItem key={p} value={p}>
              {presetLabels[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {activePreset === "custom" && (
        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
              <CalendarIcon className="h-3 w-3" />
              {format(value.from, "MMM d")} - {format(value.to, "MMM d, yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={value.from}
              selected={{ from: value.from, to: value.to }}
              onSelect={handleCustomRangeSelect}
              numberOfMonths={2}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      )}

      {activePreset !== "custom" && (
        <span className="text-xs text-muted-foreground">
          {format(value.from, "MMM d")} - {format(value.to, "MMM d, yyyy")}
        </span>
      )}
    </div>
  );
}

// Also export as named export for backward compatibility
export { DateRangeFilter };
