import { useState } from "react";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  isToday,
  addMonths,
  subMonths
} from "date-fns";
import { CalendarEvent, CalendarEventType } from "@/types/calendar";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getEventDisplayBgColor } from "./ActivityEventCard";

interface CalendarViewProps {
  currentDate: Date;
  onDateChange: (date: Date) => void;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  eventsByDate: Record<string, CalendarEvent[]>;
  showMultipleOwners?: boolean;
}

export function CalendarView({ 
  currentDate, 
  onDateChange, 
  selectedDate, 
  onSelectDate,
  eventsByDate 
}: CalendarViewProps) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const goToPreviousMonth = () => onDateChange(subMonths(currentDate, 1));
  const goToNextMonth = () => onDateChange(addMonths(currentDate, 1));
  const goToToday = () => {
    const today = new Date();
    onDateChange(today);
    onSelectDate(today);
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-primary/5 via-transparent to-accent/5 border-b border-border">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPreviousMonth} className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:border-primary/30">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={goToNextMonth} className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:border-primary/30">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday} className="rounded-lg hover:bg-primary/10 hover:border-primary/30 font-medium">
            Today
          </Button>
        </div>
        <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
          {format(currentDate, "MMMM yyyy")}
        </h2>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 flex flex-col">
        {/* Week day headers */}
        <div className="grid grid-cols-7 bg-muted/30">
          {weekDays.map((day, index) => (
            <div 
              key={day} 
              className={cn(
                "p-3 text-center text-sm font-semibold uppercase tracking-wider",
                index === 0 && "text-rose-500 dark:text-rose-400", // Sunday
                index === 6 && "text-rose-500 dark:text-rose-400", // Saturday
                index !== 0 && index !== 6 && "text-muted-foreground"
              )}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar days */}
        <div className="grid grid-cols-7 flex-1">
          {days.map((day, idx) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayEvents = eventsByDate[dateKey] || [];
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isSelected = isSameDay(day, selectedDate);
            const isTodayDate = isToday(day);
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;

            return (
              <button
                key={idx}
                onClick={() => onSelectDate(day)}
                className={cn(
                  "min-h-[100px] p-2 border-b border-r border-border/50 text-left transition-all duration-200 relative group",
                  "hover:bg-gradient-to-br hover:from-primary/5 hover:to-accent/5 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset",
                  !isCurrentMonth && "bg-muted/20 opacity-50",
                  isCurrentMonth && isWeekend && "bg-rose-50/30 dark:bg-rose-950/10",
                  isSelected && "bg-gradient-to-br from-primary/10 to-accent/10 ring-2 ring-primary ring-inset shadow-inner",
                )}
              >
                <div className="flex flex-col h-full">
                  <span 
                    className={cn(
                      "text-sm font-medium w-8 h-8 flex items-center justify-center rounded-full transition-all",
                      !isCurrentMonth && "text-muted-foreground/50",
                      isCurrentMonth && !isTodayDate && !isSelected && "group-hover:bg-primary/10",
                      isWeekend && isCurrentMonth && !isTodayDate && "text-rose-600 dark:text-rose-400",
                      isTodayDate && "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-md shadow-primary/30 font-bold",
                      isSelected && !isTodayDate && "bg-primary/20 font-bold text-primary"
                    )}
                  >
                    {format(day, 'd')}
                  </span>

                  {/* Event indicators */}
                  <div className="flex-1 mt-1.5 space-y-1 overflow-hidden">
                    {dayEvents.slice(0, 3).map((event) => (
                      <div 
                        key={event.id}
                        className={cn(
                          "text-[11px] px-1.5 py-0.5 rounded-md truncate font-medium border-l-2 transition-transform hover:scale-[1.02]",
                          getEventDisplayBgColor(event),
                          getEventBorderColor(event),
                          event.isCompleted && "opacity-40 line-through"
                        )}
                      >
                        {event.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-[10px] text-primary font-semibold px-1.5 hover:underline cursor-pointer">
                        +{dayEvents.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Helper to get border color for events
function getEventBorderColor(event: CalendarEvent): string {
  if (event.priority === 'urgent') return 'border-l-red-500';
  if (event.source === 'task' && event.taskStatus) {
    const statusColors: Record<string, string> = {
      pending: 'border-l-amber-500',
      in_progress: 'border-l-blue-500',
      completed: 'border-l-green-500',
    };
    return statusColors[event.taskStatus] || 'border-l-orange-500';
  }
  const typeColors: Record<string, string> = {
    meeting: 'border-l-blue-500',
    call: 'border-l-emerald-500',
    email: 'border-l-purple-500',
    note: 'border-l-gray-400',
    task: 'border-l-orange-500',
    follow_up: 'border-l-amber-500',
    visit: 'border-l-rose-500',
  };
  return typeColors[event.type] || 'border-l-gray-400';
}
