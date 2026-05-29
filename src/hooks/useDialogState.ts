import { useState } from "react";

export interface DialogState<T> {
  isOpen: boolean;
  editingItem: any | null;
  formData: T;
  openDialog: (item?: any) => void;
  closeDialog: () => void;
  updateFormData: (updates: Partial<T>) => void;
  setFormData: (data: T) => void;
  isEditing: boolean;
}

/**
 * Generic hook for managing dialog state with form data
 * Eliminates repetitive dialog state management across pages
 */
export function useDialogState<T>(initialFormData: T): DialogState<T> {
  const [isOpen, setIsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [formData, setFormData] = useState<T>(initialFormData);

  const openDialog = (item?: any) => {
    if (item) {
      setEditingItem(item);
      setFormData(item);
    } else {
      setEditingItem(null);
      setFormData(initialFormData);
    }
    setIsOpen(true);
  };

  const closeDialog = () => {
    setIsOpen(false);
    setEditingItem(null);
    setFormData(initialFormData);
  };

  const updateFormData = (updates: Partial<T>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  return {
    isOpen,
    editingItem,
    formData,
    openDialog,
    closeDialog,
    updateFormData,
    setFormData,
    isEditing: !!editingItem,
  };
}
