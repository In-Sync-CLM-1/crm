import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBusinessHours } from "@/hooks/useBusinessHours";

export function QuietHoursBanner() {
  const { isBusinessHours, override, setOverride } = useBusinessHours();

  if (isBusinessHours) return null;

  if (override) {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-md">
        <span className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300">
          <Clock className="h-3.5 w-3.5" />
          Live updates active outside business hours
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => setOverride(false)}
        >
          Pause again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-md">
      <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
        <Clock className="h-3.5 w-3.5" />
        Live updates paused — outside business hours (9:30 AM – 8:00 PM IST)
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => setOverride(true)}
      >
        Connect anyway
      </Button>
    </div>
  );
}
