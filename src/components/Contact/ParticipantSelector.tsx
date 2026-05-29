import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

interface User {
  id: string;
  first_name: string;
  last_name: string | null;
}

interface ParticipantSelectorProps {
  orgId: string;
  selectedUserIds: string[];
  onChange: (userIds: string[]) => void;
}

export function ParticipantSelector({ orgId, selectedUserIds, onChange }: ParticipantSelectorProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, [orgId]);

  const fetchUsers = async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .eq('org_id', orgId)
        .neq('id', currentUser?.id || '')
        .order('first_name');

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleUser = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      onChange(selectedUserIds.filter(id => id !== userId));
    } else {
      onChange([...selectedUserIds, userId]);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center space-x-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No other team members found</p>
    );
  }

  return (
    <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
      {users.map(user => {
        const initials = `${user.first_name[0]}${user.last_name?.[0] || ''}`.toUpperCase();
        const isSelected = selectedUserIds.includes(user.id);
        
        return (
          <div key={user.id} className="flex items-center space-x-2">
            <Checkbox
              id={`user-${user.id}`}
              checked={isSelected}
              onCheckedChange={() => toggleUser(user.id)}
            />
            <Label
              htmlFor={`user-${user.id}`}
              className="flex items-center gap-2 cursor-pointer flex-1"
            >
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <span>{user.first_name} {user.last_name || ''}</span>
            </Label>
          </div>
        );
      })}
    </div>
  );
}
