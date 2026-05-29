import { CalendarEventType, CalendarFilters as Filters } from "@/types/calendar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";

interface CalendarFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}

const eventTypes: { value: CalendarEventType; label: string; color: string }[] = [
  { value: "meeting", label: "Meetings", color: "bg-blue-500" },
  { value: "call", label: "Calls", color: "bg-green-500" },
  { value: "task", label: "Tasks", color: "bg-orange-500" },
  { value: "follow_up", label: "Follow-ups", color: "bg-amber-500" },
  { value: "email", label: "Emails", color: "bg-purple-500" },
  { value: "visit", label: "Visits", color: "bg-rose-500" },
  { value: "note", label: "Notes", color: "bg-gray-500" },
];

export function CalendarFiltersComponent({ filters, onFiltersChange }: CalendarFiltersProps) {
  const toggleType = (type: CalendarEventType) => {
    const newTypes = filters.types.includes(type)
      ? filters.types.filter(t => t !== type)
      : [...filters.types, type];
    onFiltersChange({ ...filters, types: newTypes });
  };

  const toggleShowCompleted = () => {
    onFiltersChange({ ...filters, showCompleted: !filters.showCompleted });
  };

  const clearFilters = () => {
    onFiltersChange({ types: [], showCompleted: true });
  };

  const hasActiveFilters = filters.types.length > 0 || !filters.showCompleted;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Filter className="h-4 w-4" />
          Filter
          {hasActiveFilters && (
            <span className="ml-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
              {filters.types.length + (filters.showCompleted ? 0 : 1)}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-sm mb-2">Activity Types</h4>
            <div className="space-y-2">
              {eventTypes.map(type => (
                <div key={type.value} className="flex items-center gap-2">
                  <Checkbox
                    id={type.value}
                    checked={filters.types.length === 0 || filters.types.includes(type.value)}
                    onCheckedChange={() => toggleType(type.value)}
                  />
                  <div className={cn("w-2 h-2 rounded-full", type.color)} />
                  <Label htmlFor={type.value} className="text-sm cursor-pointer">
                    {type.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="showCompleted"
                checked={filters.showCompleted}
                onCheckedChange={toggleShowCompleted}
              />
              <Label htmlFor="showCompleted" className="text-sm cursor-pointer">
                Show completed
              </Label>
            </div>
          </div>

          {hasActiveFilters && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={clearFilters}
              className="w-full"
            >
              Clear Filters
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
