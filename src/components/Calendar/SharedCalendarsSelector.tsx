import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users, ChevronDown } from "lucide-react";

interface SharedCalendarsSelectorProps {
  selectedUserIds: string[];
  onChange: (userIds: string[]) => void;
}

export function SharedCalendarsSelector({ selectedUserIds, onChange }: SharedCalendarsSelectorProps) {
  const [open, setOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { effectiveOrgId } = useOrgContext();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null);
    });
  }, []);

  // Fetch calendars shared with me
  const { data: sharedWithMe = [] } = useQuery({
    queryKey: ['calendars-shared-with-me', currentUserId],
    queryFn: async () => {
      if (!currentUserId) return [];
      const { data, error } = await supabase
        .from('calendar_shares')
        .select('*')
        .eq('shared_with_id', currentUserId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentUserId,
  });

  // Fetch org users to get names
  const { data: orgUsers = [] } = useQuery({
    queryKey: ['org-users', effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .eq('org_id', effectiveOrgId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveOrgId,
  });

  const getUserName = (userId: string) => {
    const user = orgUsers.find((u) => u.id === userId);
    return user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email : 'Unknown';
  };

  const getInitials = (userId: string) => {
    const user = orgUsers.find((u) => u.id === userId);
    if (!user) return '?';
    const first = user.first_name?.[0] || '';
    const last = user.last_name?.[0] || '';
    return (first + last).toUpperCase() || user.email?.[0]?.toUpperCase() || '?';
  };

  const handleToggle = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      onChange(selectedUserIds.filter((id) => id !== userId));
    } else {
      onChange([...selectedUserIds, userId]);
    }
  };

  const handleToggleMyCalendar = () => {
    if (!currentUserId) return;
    handleToggle(currentUserId);
  };

  const isMyCalendarSelected = currentUserId ? selectedUserIds.includes(currentUserId) : false;
  const selectedCount = selectedUserIds.length;

  if (sharedWithMe.length === 0) {
    return null; // Don't show if no shared calendars
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Users className="h-4 w-4" />
          <span className="hidden sm:inline">Calendars</span>
          {selectedCount > 1 && (
            <span className="ml-1 rounded-full bg-primary text-primary-foreground text-xs px-1.5">
              {selectedCount}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="space-y-1">
          {/* My Calendar */}
          <div
            className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer"
            onClick={handleToggleMyCalendar}
          >
            <Checkbox checked={isMyCalendarSelected} />
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                {currentUserId ? getInitials(currentUserId) : 'Me'}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">My Calendar</span>
          </div>

          {sharedWithMe.length > 0 && (
            <>
              <div className="border-t my-2" />
              <p className="text-xs text-muted-foreground px-2 py-1">Shared with me</p>
              {sharedWithMe.map((share) => (
                <div
                  key={share.id}
                  className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer"
                  onClick={() => handleToggle(share.owner_id)}
                >
                  <Checkbox checked={selectedUserIds.includes(share.owner_id)} />
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs">{getInitials(share.owner_id)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{getUserName(share.owner_id)}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
