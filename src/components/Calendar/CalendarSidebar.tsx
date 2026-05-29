import { CalendarEvent } from "@/types/calendar";
import { format, isSameDay, isToday } from "date-fns";
import { ActivityEventCard } from "./ActivityEventCard";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CalendarSidebarProps {
  selectedDate: Date;
  events: CalendarEvent[];
  onCreateActivity: () => void;
  onMarkComplete: (event: CalendarEvent) => void;
  onEdit?: (event: CalendarEvent) => void;
  onDelete?: (event: CalendarEvent) => void;
  onClose?: () => void;
  isMobile?: boolean;
  currentUserId?: string | null;
}

export function CalendarSidebar({ 
  selectedDate, 
  events, 
  onCreateActivity, 
  onMarkComplete,
  onEdit,
  onDelete,
  onClose,
  isMobile = false,
  currentUserId
}: CalendarSidebarProps) {
  const dayEvents = events
    .filter(e => isSameDay(e.dateTime, selectedDate))
    .sort((a, b) => {
      // All-day events (tasks) first
      if (a.isAllDay && !b.isAllDay) return -1;
      if (!a.isAllDay && b.isAllDay) return 1;
      // Both all-day: sort by title
      if (a.isAllDay && b.isAllDay) return a.title.localeCompare(b.title);
      // Both timed: sort by time
      return a.dateTime.getTime() - b.dateTime.getTime();
    });

  const pendingEvents = dayEvents.filter(e => !e.isCompleted);
  const completedEvents = dayEvents.filter(e => e.isCompleted);

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-card to-card/95 border-l border-border shadow-lg">
      <div className="p-4 border-b border-border bg-gradient-to-r from-primary/5 via-transparent to-accent/5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">
              {format(selectedDate, "EEEE")}
            </h3>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              {format(selectedDate, "MMMM d, yyyy")}
              {isToday(selectedDate) && (
                <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-xs font-semibold shadow-sm">
                  Today
                </span>
              )}
            </p>
          </div>
          <Button 
            size="sm" 
            onClick={onCreateActivity}
            className="bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-md hover:shadow-lg transition-all duration-200"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {dayEvents.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-muted to-muted/50 mx-auto mb-4 flex items-center justify-center">
                <Plus className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="text-muted-foreground text-sm mb-3">No activities scheduled</p>
              <Button 
                variant="outline" 
                size="sm" 
                className="hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors"
                onClick={onCreateActivity}
              >
                <Plus className="h-4 w-4 mr-1" />
                Create Activity
              </Button>
            </div>
          ) : (
            <>
              {pendingEvents.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 animate-pulse" />
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Scheduled
                    </h4>
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold">
                      {pendingEvents.length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {pendingEvents.map(event => (
                      <ActivityEventCard 
                        key={event.id} 
                        event={event}
                        onMarkComplete={onMarkComplete}
                        onEdit={onEdit}
                        onDelete={onDelete}
                      />
                    ))}
                  </div>
                </div>
              )}

              {completedEvents.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-gradient-to-r from-emerald-500 to-green-500" />
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Completed
                    </h4>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                      {completedEvents.length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {completedEvents.map(event => (
                      <ActivityEventCard 
                        key={event.id} 
                        event={event}
                        onEdit={onEdit}
                        onDelete={onDelete}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
