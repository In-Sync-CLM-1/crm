import { CalendarDays, CheckSquare, LayoutGrid } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type ViewMode = 'all' | 'activities' | 'tasks';

interface CalendarViewToggleProps {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
}

export function CalendarViewToggle({ value, onChange }: CalendarViewToggleProps) {
  return (
    <TooltipProvider>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(val) => val && onChange(val as ViewMode)}
        className="border rounded-lg p-1"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem value="all" aria-label="Show all" className="px-2 sm:px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline ml-1.5">All</span>
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent className="sm:hidden">All</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem value="activities" aria-label="Show activities" className="px-2 sm:px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              <CalendarDays className="h-4 w-4" />
              <span className="hidden sm:inline ml-1.5">Activities</span>
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent className="sm:hidden">Activities</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem value="tasks" aria-label="Show tasks" className="px-2 sm:px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              <CheckSquare className="h-4 w-4" />
              <span className="hidden sm:inline ml-1.5">Tasks</span>
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent className="sm:hidden">Tasks</TooltipContent>
        </Tooltip>
      </ToggleGroup>
    </TooltipProvider>
  );
}
