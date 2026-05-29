import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface DateTimePickerProps {
  value?: Date | null;
  onChange: (date: Date | null) => void;
  minDate?: Date;
  label?: string;
}

export function DateTimePicker({ value, onChange, minDate = new Date(), label = "Select date and time" }: DateTimePickerProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(value || undefined);
  const [timeString, setTimeString] = useState(
    value ? format(value, "HH:mm") : format(new Date(), "HH:mm")
  );
  const [open, setOpen] = useState(false);

  // Sync internal state when value prop changes
  useEffect(() => {
    if (value) {
      setSelectedDate(value);
      setTimeString(format(value, "HH:mm"));
    }
  }, [value]);

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    
    setSelectedDate(date);
    
    // Parse time from timeString
    const [hours, minutes] = timeString.split(':').map(Number);
    const newDateTime = new Date(date);
    newDateTime.setHours(hours, minutes, 0, 0);
    
    onChange(newDateTime);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value;
    setTimeString(newTime);
    
    if (selectedDate) {
      const [hours, minutes] = newTime.split(':').map(Number);
      const newDateTime = new Date(selectedDate);
      newDateTime.setHours(hours, minutes, 0, 0);
      
      onChange(newDateTime);
    }
  };

  const displayText = value 
    ? `${format(value, "PPP")} at ${format(value, "p")}`
    : "Pick date and time";

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {displayText}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleDateSelect}
            disabled={(date) => {
              const minDateStart = new Date(minDate);
              minDateStart.setHours(0, 0, 0, 0);
              return date < minDateStart;
            }}
            initialFocus
            className="pointer-events-auto"
          />
          <div className="border-t p-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-normal text-muted-foreground">Time:</Label>
              <Input
                type="time"
                value={timeString}
                onChange={handleTimeChange}
                className="w-[120px]"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
