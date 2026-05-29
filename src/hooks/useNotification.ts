import { toast } from "@/hooks/use-toast";

export interface NotificationActions {
  success: (title: string, description?: string) => void;
  error: (title: string, error?: any) => void;
  info: (title: string, description?: string) => void;
  confirm: (message: string) => boolean;
}

/**
 * Standardized notification hook
 * Provides consistent toast notifications across the application
 */
export function useNotification(): NotificationActions {
  return {
    success: (title: string, description?: string) => {
      toast({ title, description });
    },
    error: (title: string, error?: any) => {
      toast({
        variant: "destructive",
        title,
        description: typeof error === 'string' ? error : (error?.message || "An error occurred. Please try again."),
      });
    },
    info: (title: string, description?: string) => {
      toast({ title, description, variant: "default" });
    },
    confirm: (message: string) => {
      return window.confirm(message);
    },
  };
}
