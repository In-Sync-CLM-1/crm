import { useState } from "react";
import { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useNotification } from "./useNotification";

export interface DragDropOrderState<T extends { id: string }> {
  items: T[];
  activeId: string | null;
  setItems: (items: T[]) => void;
  handleDragStart: (event: { active: { id: string } }) => void;
  handleDragEnd: (event: DragEndEvent, onReorder: (items: T[]) => Promise<void>) => Promise<void>;
  handleDragCancel: () => void;
  isReordering: boolean;
}

/**
 * Hook for managing drag-and-drop reordering
 * Handles drag state, reordering logic, and persistence
 */
export function useDragDropOrder<T extends { id: string }>(): DragDropOrderState<T> {
  const notify = useNotification();
  const [items, setItems] = useState<T[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);

  const handleDragStart = (event: { active: { id: string } }) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = async (
    event: DragEndEvent,
    onReorder: (items: T[]) => Promise<void>
  ) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      setActiveId(null);
      return;
    }

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);

    const reorderedItems = arrayMove(items, oldIndex, newIndex);
    setItems(reorderedItems);
    setActiveId(null);

    setIsReordering(true);
    try {
      await onReorder(reorderedItems);
    } catch (error: any) {
      notify.error("Failed to reorder", error);
      // Revert on error
      setItems(items);
    } finally {
      setIsReordering(false);
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  return {
    items,
    activeId,
    setItems,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
    isReordering,
  };
}
