export type CalendarEventType = 'meeting' | 'call' | 'task' | 'follow_up' | 'email' | 'note' | 'visit';

export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export type ViewMode = 'all' | 'activities' | 'tasks';

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  dateTime: Date;
  endTime?: Date;
  duration?: number;
  contactId?: string;
  contactName?: string;
  isCompleted: boolean;
  source: 'activity' | 'task';
  description?: string;
  meetingLink?: string;
  assignedTo?: string;
  assignedToName?: string;
  priority?: string;
  taskStatus?: TaskStatus;
  recurringPatternId?: string;
  isRecurring?: boolean;
  isAllDay?: boolean;
  ownerId?: string;
  ownerName?: string;
}

export interface CalendarFilters {
  types: CalendarEventType[];
  showCompleted: boolean;
  assignedTo?: string;
}

export interface CalendarShare {
  id: string;
  org_id: string;
  owner_id: string;
  shared_with_id: string;
  permission: 'view' | 'edit';
  created_at: string;
}
