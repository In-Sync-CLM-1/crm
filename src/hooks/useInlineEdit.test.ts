import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInlineEdit } from './useInlineEdit';

describe('useInlineEdit', () => {
  it('should start editing mode', () => {
    const { result } = renderHook(() => useInlineEdit<{ name: string }>());
    const initialValue = { name: 'John' };
    
    act(() => {
      result.current.startEdit('1', initialValue);
    });
    
    expect(result.current.isEditing('1')).toBe(true);
    expect(result.current.editValue).toEqual(initialValue);
  });

  it('should update edit value', () => {
    const { result } = renderHook(() => useInlineEdit<{ name: string }>());
    
    act(() => {
      result.current.startEdit('1', { name: 'John' });
      result.current.updateEdit({ name: 'Jane' });
    });
    
    expect(result.current.editValue.name).toBe('Jane');
  });

  it('should cancel editing', () => {
    const { result } = renderHook(() => useInlineEdit<{ name: string }>());
    
    act(() => {
      result.current.startEdit('1', { name: 'John' });
      result.current.cancelEdit();
    });
    
    expect(result.current.editingId).toBeNull();
    expect(result.current.editValue).toEqual({});
  });

  it('should save edit successfully', async () => {
    const { result } = renderHook(() => useInlineEdit<{ name: string }>());
    const onSave = vi.fn().mockResolvedValue(undefined);
    
    act(() => {
      result.current.startEdit('1', { name: 'John' });
      result.current.updateEdit({ name: 'Jane' });
    });
    
    await act(async () => {
      await result.current.saveEdit('1', onSave);
    });
    
    expect(onSave).toHaveBeenCalledWith('1', { name: 'Jane' });
    expect(result.current.editingId).toBeNull();
    expect(result.current.isSaving).toBe(false);
  });

  it('should handle save error', async () => {
    const { result } = renderHook(() => useInlineEdit<{ name: string }>());
    const onSave = vi.fn().mockRejectedValue(new Error('Save failed'));
    
    act(() => {
      result.current.startEdit('1', { name: 'John' });
    });
    
    await act(async () => {
      await result.current.saveEdit('1', onSave);
    });
    
    expect(result.current.isSaving).toBe(false);
    expect(result.current.editingId).toBe('1'); // Still in edit mode on error
  });
});
