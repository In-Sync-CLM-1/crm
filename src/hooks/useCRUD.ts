import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNotification } from "./useNotification";

export interface CRUDOptions {
  onSuccess?: () => void;
  onError?: (error: any) => void;
  successMessage?: {
    create?: string;
    update?: string;
    delete?: string;
  };
}

export interface CRUDActions {
  create: (data: any) => void;
  update: (params: { id: string; data: any }) => void;
  delete: (id: string) => void;
  isLoading: boolean;
}

/**
 * Generic CRUD operations hook
 * Provides standardized create, update, delete operations with notifications
 */
export function useCRUD<T = any>(
  tableName: string,
  options?: CRUDOptions
): CRUDActions {
  const notify = useNotification();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (data: Partial<T>) => {
      const { error } = await supabase.from(tableName as any).insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      notify.success(
        options?.successMessage?.create || `${tableName} created successfully`
      );
      queryClient.invalidateQueries({ queryKey: [tableName] });
      options?.onSuccess?.();
    },
    onError: (error) => {
      notify.error(`Failed to create ${tableName}`, error);
      options?.onError?.(error);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<T> }) => {
      const { error } = await supabase
        .from(tableName as any)
        .update(data)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      notify.success(
        options?.successMessage?.update || `${tableName} updated successfully`
      );
      queryClient.invalidateQueries({ queryKey: [tableName] });
      options?.onSuccess?.();
    },
    onError: (error) => {
      notify.error(`Failed to update ${tableName}`, error);
      options?.onError?.(error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(tableName as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      notify.success(
        options?.successMessage?.delete || `${tableName} deleted successfully`
      );
      queryClient.invalidateQueries({ queryKey: [tableName] });
      options?.onSuccess?.();
    },
    onError: (error) => {
      notify.error(`Failed to delete ${tableName}`, error);
      options?.onError?.(error);
    },
  });

  return {
    create: createMutation.mutate,
    update: updateMutation.mutate,
    delete: deleteMutation.mutate,
    isLoading:
      createMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending,
  };
}
