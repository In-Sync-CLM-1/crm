import { useState } from "react";
import { useNotification } from "./useNotification";

export interface InlineEditState<T> {
  editingId: string | null;
  editValue: Partial<T>;
  isEditing: (id: string) => boolean;
  startEdit: (id: string, initialValue: T) => void;
  updateEdit: (updates: Partial<T>) => void;
  cancelEdit: () => void;
  saveEdit: (id: string, onSave: (id: string, value: Partial<T>) => Promise<void>) => Promise<void>;
  isSaving: boolean;
}

/**
 * Hook for managing inline editing state
 * Handles edit mode, validation, and save/cancel operations
 */
export function useInlineEdit<T>(): InlineEditState<T> {
  const notify = useNotification();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<Partial<T>>({});
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = (id: string) => editingId === id;

  const startEdit = (id: string, initialValue: T) => {
    setEditingId(id);
    setEditValue(initialValue);
  };

  const updateEdit = (updates: Partial<T>) => {
    setEditValue((prev) => ({ ...prev, ...updates }));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue({});
  };

  const saveEdit = async (id: string, onSave: (id: string, value: Partial<T>) => Promise<void>) => {
    setIsSaving(true);
    try {
      await onSave(id, editValue);
      setEditingId(null);
      setEditValue({});
    } catch (error: any) {
      notify.error("Failed to save", error);
    } finally {
      setIsSaving(false);
    }
  };

  return {
    editingId,
    editValue,
    isEditing,
    startEdit,
    updateEdit,
    cancelEdit,
    saveEdit,
    isSaving,
  };
}
