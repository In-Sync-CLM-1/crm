import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSync } from "./useRealtimeSync";
import { useOrgContext } from "./useOrgContext";
import { toast } from "./use-toast";
import { useCallback, useRef } from "react";

interface Notification {
  id: string;
  org_id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  read_at: string | null;
  action_url: string | null;
  metadata: any;
  created_at: string;
  expires_at: string;
}

// Play notification sound for urgent reminders
function playUrgentNotificationSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.value = 0.3;
    
    oscillator.start();
    
    // Create a pleasant two-tone alert
    setTimeout(() => {
      oscillator.frequency.value = 1000;
    }, 150);
    
    setTimeout(() => {
      oscillator.frequency.value = 800;
    }, 300);
    
    setTimeout(() => {
      oscillator.frequency.value = 1000;
    }, 450);
    
    setTimeout(() => {
      oscillator.stop();
    }, 600);
  } catch (err) {
    console.log('Audio notification not supported');
  }
}

export function useNotifications() {
  const queryClient = useQueryClient();
  const { effectiveOrgId } = useOrgContext();
  
  // Use ref to store queryClient to prevent callback recreation
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  // Fetch notifications
  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["notifications", effectiveOrgId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("notifications" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as unknown as Notification[];
    },
    enabled: !!effectiveOrgId,
  });

  // Count unread notifications
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from("notifications" as any)
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClientRef.current.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // Mark all as read mutation
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("notifications" as any)
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClientRef.current.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // Stable callback using useCallback with empty deps
  const handleInsert = useCallback((payload: any) => {
    queryClientRef.current.invalidateQueries({ queryKey: ["notifications"] });
    
    // Show toast for new notification
    const notification = payload.new;
    if (notification && !notification.is_read) {
      // Check if it's an urgent callback reminder
      const isUrgentCallback = 
        (notification.type === 'next_action_urgent' || notification.type === 'callback_reminder') &&
        notification.metadata?.is_callback_reminder;
      
      if (isUrgentCallback) {
        // Play urgent sound for callback reminders
        playUrgentNotificationSound();
        
        toast({
          title: "🔔 " + notification.title,
          description: notification.message,
          duration: 10000, // Show for 10 seconds
        });
      } else {
        toast({
          title: notification.title,
          description: notification.message,
        });
      }
    }
  }, []);

  // Stable callback for updates
  const handleUpdate = useCallback(() => {
    queryClientRef.current.invalidateQueries({ queryKey: ["notifications"] });
  }, []);

  // Real-time subscription for new notifications
  useRealtimeSync({
    table: "notifications",
    onInsert: handleInsert,
    onUpdate: handleUpdate,
    enabled: !!effectiveOrgId,
  });

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead: markAsReadMutation.mutate,
    markAllAsRead: markAllAsReadMutation.mutate,
  };
}
