import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Share2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

interface ShareCalendarDialogProps {
  trigger?: React.ReactNode;
}

export function ShareCalendarDialog({ trigger }: ShareCalendarDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [permission, setPermission] = useState<string>("view");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { effectiveOrgId } = useOrgContext();
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null);
    });
  }, []);

  // Fetch org users
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
    enabled: !!effectiveOrgId && open,
  });

  // Fetch current shares (where I am the owner)
  const { data: myShares = [] } = useQuery({
    queryKey: ['my-calendar-shares', currentUserId],
    queryFn: async () => {
      if (!currentUserId) return [];
      const { data, error } = await supabase
        .from('calendar_shares')
        .select('*')
        .eq('owner_id', currentUserId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentUserId && open,
  });

  // Fetch shares where others shared with me
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
    enabled: !!currentUserId && open,
  });

  // Add share mutation
  const addShareMutation = useMutation({
    mutationFn: async ({ sharedWithId, perm }: { sharedWithId: string; perm: string }) => {
      if (!currentUserId || !effectiveOrgId) throw new Error("Not authenticated");
      const { error } = await supabase
        .from('calendar_shares')
        .insert({
          org_id: effectiveOrgId,
          owner_id: currentUserId,
          shared_with_id: sharedWithId,
          permission: perm,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-calendar-shares'] });
      setSelectedUserId("");
      toast.success("Calendar shared successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to share calendar");
    },
  });

  // Remove share mutation
  const removeShareMutation = useMutation({
    mutationFn: async (shareId: string) => {
      const { error } = await supabase
        .from('calendar_shares')
        .delete()
        .eq('id', shareId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-calendar-shares'] });
      toast.success("Share removed");
    },
    onError: () => {
      toast.error("Failed to remove share");
    },
  });

  const availableUsers = orgUsers.filter(
    (u) => u.id !== currentUserId && !myShares.some((s) => s.shared_with_id === u.id)
  );

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Share2 className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">Share</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share Calendar</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Add new share */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Share with team member</h4>
            <div className="flex gap-2">
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">No users available</div>
                  ) : (
                    availableUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.first_name} {user.last_name} ({user.email})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Select value={permission} onValueChange={setPermission}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">View</SelectItem>
                  <SelectItem value="edit">Edit</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="icon"
                onClick={() => addShareMutation.mutate({ sharedWithId: selectedUserId, perm: permission })}
                disabled={!selectedUserId || addShareMutation.isPending}
              >
                <UserPlus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Current shares */}
          {myShares.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium">People with access</h4>
              <div className="space-y-2">
                {myShares.map((share) => (
                  <div key={share.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">{getInitials(share.shared_with_id)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{getUserName(share.shared_with_id)}</p>
                        <p className="text-xs text-muted-foreground capitalize">{share.permission}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeShareMutation.mutate(share.id)}
                      disabled={removeShareMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Calendars shared with me */}
          {sharedWithMe.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Calendars shared with you</h4>
              <div className="space-y-2">
                {sharedWithMe.map((share) => (
                  <div key={share.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">{getInitials(share.owner_id)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{getUserName(share.owner_id)}</p>
                      <p className="text-xs text-muted-foreground capitalize">{share.permission} access</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
