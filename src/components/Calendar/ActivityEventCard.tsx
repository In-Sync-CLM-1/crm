import { CalendarEvent, CalendarEventType, TaskStatus } from "@/types/calendar";
import { format } from "date-fns";
import { 
  Phone, 
  Video, 
  Mail, 
  FileText, 
  CheckSquare, 
  Clock, 
  MapPin,
  User,
  ExternalLink,
  Check,
  Repeat,
  Pencil,
  Trash2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ActivityEventCardProps {
  event: CalendarEvent;
  onMarkComplete?: (event: CalendarEvent) => void;
  onEdit?: (event: CalendarEvent) => void;
  onDelete?: (event: CalendarEvent) => void;
  compact?: boolean;
}

const typeConfig: Record<CalendarEventType, { 
  icon: React.ElementType; 
  color: string; 
  bgColor: string;
  label: string;
  gradient: string;
}> = {
  meeting: { 
    icon: Video, 
    color: "text-blue-600 dark:text-blue-400", 
    bgColor: "bg-gradient-to-r from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-blue-800/20",
    gradient: "from-blue-500 to-blue-600",
    label: "Meeting"
  },
  call: { 
    icon: Phone, 
    color: "text-emerald-600 dark:text-emerald-400", 
    bgColor: "bg-gradient-to-r from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-emerald-800/20",
    gradient: "from-emerald-500 to-emerald-600",
    label: "Call"
  },
  email: { 
    icon: Mail, 
    color: "text-violet-600 dark:text-violet-400", 
    bgColor: "bg-gradient-to-r from-violet-100 to-violet-50 dark:from-violet-900/40 dark:to-violet-800/20",
    gradient: "from-violet-500 to-violet-600",
    label: "Email"
  },
  note: { 
    icon: FileText, 
    color: "text-slate-600 dark:text-slate-400", 
    bgColor: "bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800/40 dark:to-slate-700/20",
    gradient: "from-slate-500 to-slate-600",
    label: "Note"
  },
  task: { 
    icon: CheckSquare, 
    color: "text-orange-600 dark:text-orange-400", 
    bgColor: "bg-gradient-to-r from-orange-100 to-orange-50 dark:from-orange-900/40 dark:to-orange-800/20",
    gradient: "from-orange-500 to-orange-600",
    label: "Task"
  },
  follow_up: { 
    icon: Clock, 
    color: "text-amber-600 dark:text-amber-400", 
    bgColor: "bg-gradient-to-r from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-800/20",
    gradient: "from-amber-500 to-amber-600",
    label: "Follow-up"
  },
  visit: { 
    icon: MapPin, 
    color: "text-rose-600 dark:text-rose-400", 
    bgColor: "bg-gradient-to-r from-rose-100 to-rose-50 dark:from-rose-900/40 dark:to-rose-800/20",
    gradient: "from-rose-500 to-rose-600",
    label: "Visit"
  },
};

// Task status color configuration
const taskStatusConfig: Record<TaskStatus, { 
  bgColor: string; 
  borderColor: string;
  badgeClass: string;
  label: string;
  iconBg: string;
}> = {
  pending: { 
    bgColor: "bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/20", 
    borderColor: "border-l-4 border-l-amber-500",
    badgeClass: "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm",
    iconBg: "bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/50 dark:to-amber-800/50",
    label: "New" 
  },
  in_progress: { 
    bgColor: "bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/20", 
    borderColor: "border-l-4 border-l-blue-500",
    badgeClass: "bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-sm",
    iconBg: "bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/50 dark:to-blue-800/50",
    label: "In Progress" 
  },
  completed: { 
    bgColor: "bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/30 dark:to-green-900/20", 
    borderColor: "border-l-4 border-l-emerald-500",
    badgeClass: "bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-sm",
    iconBg: "bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-900/50 dark:to-emerald-800/50",
    label: "Completed" 
  },
};

export function ActivityEventCard({ event, onMarkComplete, onEdit, onDelete, compact = false }: ActivityEventCardProps) {
  const config = typeConfig[event.type] || typeConfig.note;
  const Icon = config.icon;
  const time = format(event.dateTime, "h:mm a");
  
  // For tasks, use status-based styling
  const isTask = event.source === 'task' && event.taskStatus;
  const statusConfig = isTask ? taskStatusConfig[event.taskStatus!] : null;
  
  // Check if urgent priority
  const isUrgent = event.priority === 'urgent';

  if (compact) {
    return (
      <div 
        className={cn(
          "group relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs border transition-all duration-200",
          isUrgent 
            ? "bg-gradient-to-r from-red-100 to-red-50 dark:from-red-900/40 dark:to-red-800/20 border-red-300 dark:border-red-700 shadow-sm shadow-red-200/50 dark:shadow-red-900/30" 
            : isTask && statusConfig 
              ? cn(statusConfig.bgColor, "border-transparent") 
              : cn(config.bgColor, "border-transparent"),
          "hover:shadow-md hover:scale-[1.01]",
          event.isCompleted && "opacity-50"
        )}
      >
        <div className={cn(
          "p-1 rounded-md",
          isUrgent ? "bg-red-200 dark:bg-red-800/50" : "bg-white/60 dark:bg-white/10"
        )}>
          <Icon className={cn("h-3 w-3", isUrgent ? "text-red-600 dark:text-red-400" : config.color)} />
        </div>
        <span className={cn("truncate flex-1 font-medium", isUrgent && "text-red-700 dark:text-red-300")}>{event.title}</span>
        {event.isRecurring && (
          <Repeat className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        )}
        {/* Hover actions for compact view */}
        <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-background/95 rounded-md shadow-sm px-1 py-0.5 border border-border">
          {onEdit && (
            <Button
              size="sm"
              variant="ghost"
              className="h-5 w-5 p-0 hover:bg-primary/10"
              onClick={(e) => { e.stopPropagation(); onEdit(event); }}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
          {onDelete && (
            <Button
              size="sm"
              variant="ghost"
              className="h-5 w-5 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={(e) => { e.stopPropagation(); onDelete(event); }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div 
      className={cn(
        "group relative p-4 rounded-xl border-2 bg-card hover:shadow-lg transition-all duration-300",
        isUrgent 
          ? "border-red-400 dark:border-red-600 bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/30 border-l-4 border-l-red-500 shadow-md shadow-red-100/50 dark:shadow-red-900/20" 
          : isTask && statusConfig 
            ? cn("border-border/50", statusConfig.borderColor, statusConfig.bgColor) 
            : cn("border-border/50", config.bgColor),
        "hover:scale-[1.01] hover:border-primary/30",
        event.isCompleted && "opacity-60"
      )}
    >
      {/* Hover action buttons */}
      <div className="absolute top-3 right-3 hidden group-hover:flex items-center gap-1 bg-background/95 backdrop-blur-sm rounded-lg shadow-lg border border-border/50 px-1.5 py-1">
        {onEdit && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 hover:bg-primary/10 rounded-md"
                onClick={() => onEdit(event)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit</TooltipContent>
          </Tooltip>
        )}
        {onDelete && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-md"
                onClick={() => onDelete(event)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        )}
        {!event.isCompleted && onMarkComplete && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-md"
                onClick={() => onMarkComplete(event)}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Mark complete</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={cn(
            "p-2.5 rounded-xl shadow-sm", 
            isTask && statusConfig ? statusConfig.iconBg : "bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border border-border/30"
          )}>
            <Icon className={cn("h-5 w-5", config.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className={cn(
                "font-medium text-sm",
                event.isCompleted && "line-through"
              )}>
                {event.title}
              </h4>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {config.label}
              </Badge>
              {/* Show task status badge for tasks */}
              {isTask && statusConfig && (
                <Badge 
                  className={cn("text-[10px] px-1.5 py-0 border-0", statusConfig.badgeClass)}
                >
                  {statusConfig.label}
                </Badge>
              )}
              {event.isRecurring && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                      <Repeat className="h-2.5 w-2.5" />
                      Recurring
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Part of a recurring series
                  </TooltipContent>
                </Tooltip>
              )}
              {event.priority && event.priority !== 'normal' && (
                <Badge 
                  variant={event.priority === 'urgent' ? 'destructive' : 'outline'}
                  className={cn(
                    "text-[10px] px-1.5 py-0",
                    event.priority === 'important' && "border-amber-500 text-amber-600 dark:text-amber-400",
                    event.priority === 'high' && "border-destructive"
                  )}
                >
                  {event.priority === 'urgent' ? 'Urgent' : 
                   event.priority === 'important' ? 'Important' : 
                   event.priority === 'high' ? 'High' : event.priority}
                </Badge>
              )}
            </div>
            
            {!event.isAllDay && (
              <p className="text-xs text-muted-foreground mt-0.5">{time}</p>
            )}
            
            {event.contactName && (
              <Link 
                to={`/contacts/${event.contactId}`}
                className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
              >
                <User className="h-3 w-3" />
                {event.contactName}
              </Link>
            )}
            
            {event.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {event.description}
              </p>
            )}
            
            {event.meetingLink && (
              <a 
                href={event.meetingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
              >
                <ExternalLink className="h-3 w-3" />
                Join Meeting
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function getEventTypeColor(type: CalendarEventType): string {
  return typeConfig[type]?.color || typeConfig.note.color;
}

export function getEventTypeBgColor(type: CalendarEventType): string {
  return typeConfig[type]?.bgColor || typeConfig.note.bgColor;
}

// Get display color for an event (uses task status for tasks, type for others)
export function getEventDisplayBgColor(event: CalendarEvent): string {
  if (event.source === 'task' && event.taskStatus) {
    return taskStatusConfig[event.taskStatus]?.bgColor || typeConfig.task.bgColor;
  }
  return getEventTypeBgColor(event.type);
}

export function getTaskStatusBgColor(status: TaskStatus): string {
  return taskStatusConfig[status]?.bgColor || taskStatusConfig.pending.bgColor;
}
