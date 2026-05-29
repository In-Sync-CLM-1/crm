import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDragDropOrder } from './useDragDropOrder';

interface TestItem {
  id: string;
  name: string;
}

describe('useDragDropOrder', () => {
  const mockItems: TestItem[] = [
    { id: '1', name: 'Item 1' },
    { id: '2', name: 'Item 2' },
    { id: '3', name: 'Item 3' },
  ];

  it('should initialize with empty items', () => {
    const { result } = renderHook(() => useDragDropOrder<TestItem>());
    
    expect(result.current.items).toEqual([]);
    expect(result.current.activeId).toBeNull();
  });

  it('should handle drag start', () => {
    const { result } = renderHook(() => useDragDropOrder<TestItem>());
    
    act(() => {
      result.current.setItems(mockItems);
      result.current.handleDragStart({ active: { id: '2' } } as any);
    });
    
    expect(result.current.activeId).toBe('2');
  });

  it('should reorder items on drag end', async () => {
    const { result } = renderHook(() => useDragDropOrder<TestItem>());
    const onReorder = vi.fn().mockResolvedValue(undefined);
    
    act(() => {
      result.current.setItems(mockItems);
    });
    
    await act(async () => {
      await result.current.handleDragEnd(
        { active: { id: '1' }, over: { id: '3' } } as any,
        onReorder
      );
    });
    
    expect(result.current.items[0].id).toBe('2');
    expect(result.current.items[2].id).toBe('1');
    expect(onReorder).toHaveBeenCalled();
  });

  it('should handle drag cancel', () => {
    const { result } = renderHook(() => useDragDropOrder<TestItem>());
    
    act(() => {
      result.current.setItems(mockItems);
      result.current.handleDragStart({ active: { id: '2' } } as any);
      result.current.handleDragCancel();
    });
    
    expect(result.current.activeId).toBeNull();
  });

  it('should not reorder if no over target', async () => {
    const { result } = renderHook(() => useDragDropOrder<TestItem>());
    const onReorder = vi.fn().mockResolvedValue(undefined);
    
    act(() => {
      result.current.setItems(mockItems);
    });
    
    await act(async () => {
      await result.current.handleDragEnd(
        { active: { id: '1' }, over: null } as any,
        onReorder
      );
    });
    
    expect(result.current.items).toEqual(mockItems);
    expect(onReorder).not.toHaveBeenCalled();
  });
});
