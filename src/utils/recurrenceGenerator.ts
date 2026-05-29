import { addDays, addMonths, addYears, isBefore, isEqual, startOfDay } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

// IST timezone
const IST_TIMEZONE = "Asia/Kolkata";

export interface RecurrenceOptions {
  startDate: Date;
  daysOfWeek: number[]; // 0=Sunday, 1=Monday, ..., 6=Saturday
  durationType: 'months' | 'years';
  durationValue: number;
  scheduledTime: string; // "HH:mm" format
}

export interface RecurrenceInstance {
  date: Date;
  scheduledAt: Date; // This will be in UTC for database storage
}

/**
 * Generate all recurring instances based on the given options
 * @param options - Recurrence configuration
 * @returns Array of dates for each occurrence (scheduledAt is in UTC)
 */
export function generateRecurrenceInstances(options: RecurrenceOptions): RecurrenceInstance[] {
  const { startDate, daysOfWeek, durationType, durationValue, scheduledTime } = options;
  
  if (daysOfWeek.length === 0 || durationValue <= 0) {
    return [];
  }

  // Calculate end date based on duration
  const endDate = durationType === 'months' 
    ? addMonths(startDate, durationValue)
    : addYears(startDate, durationValue);

  const instances: RecurrenceInstance[] = [];
  let currentDate = startOfDay(startDate);
  const endDateNormalized = startOfDay(endDate);

  // Parse scheduled time
  const [hours, minutes] = scheduledTime.split(':').map(Number);

  // Iterate through each day from start to end
  while (isBefore(currentDate, endDateNormalized) || isEqual(currentDate, endDateNormalized)) {
    const dayOfWeek = currentDate.getDay();
    
    if (daysOfWeek.includes(dayOfWeek)) {
      // Create the local IST datetime
      const localISTDate = new Date(currentDate);
      localISTDate.setHours(hours, minutes, 0, 0);
      
      // Convert IST to UTC for database storage
      const scheduledAtUTC = fromZonedTime(localISTDate, IST_TIMEZONE);
      
      instances.push({
        date: new Date(currentDate),
        scheduledAt: scheduledAtUTC,
      });
    }
    
    currentDate = addDays(currentDate, 1);
  }

  return instances;
}

/**
 * Calculate the number of occurrences for preview purposes
 */
export function countRecurrenceInstances(options: Omit<RecurrenceOptions, 'scheduledTime'>): number {
  const { startDate, daysOfWeek, durationType, durationValue } = options;
  
  if (daysOfWeek.length === 0 || durationValue <= 0) {
    return 0;
  }

  const endDate = durationType === 'months' 
    ? addMonths(startDate, durationValue)
    : addYears(startDate, durationValue);

  let count = 0;
  let currentDate = startOfDay(startDate);
  const endDateNormalized = startOfDay(endDate);

  while (isBefore(currentDate, endDateNormalized) || isEqual(currentDate, endDateNormalized)) {
    if (daysOfWeek.includes(currentDate.getDay())) {
      count++;
    }
    currentDate = addDays(currentDate, 1);
  }

  return count;
}

/**
 * Get day name abbreviations
 */
export const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
