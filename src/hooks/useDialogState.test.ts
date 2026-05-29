import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDialogState } from './useDialogState';

interface TestFormData {
  name: string;
  email: string;
}

describe('useDialogState', () => {
  const initialFormData: TestFormData = { name: '', email: '' };

  it('should initialize with closed state', () => {
    const { result } = renderHook(() => useDialogState(initialFormData));
    
    expect(result.current.isOpen).toBe(false);
    expect(result.current.editingItem).toBeNull();
    expect(result.current.formData).toEqual(initialFormData);
  });

  it('should open dialog in create mode', () => {
    const { result } = renderHook(() => useDialogState(initialFormData));
    
    act(() => {
      result.current.openDialog();
    });
    
    expect(result.current.isOpen).toBe(true);
    expect(result.current.isEditing).toBe(false);
    expect(result.current.formData).toEqual(initialFormData);
  });

  it('should open dialog in edit mode with item data', () => {
    const { result } = renderHook(() => useDialogState(initialFormData));
    const editItem = { id: '1', name: 'John', email: 'john@example.com' };
    
    act(() => {
      result.current.openDialog(editItem);
    });
    
    expect(result.current.isOpen).toBe(true);
    expect(result.current.isEditing).toBe(true);
    expect(result.current.editingItem).toEqual(editItem);
    expect(result.current.formData).toEqual(editItem);
  });

  it('should update form data', () => {
    const { result } = renderHook(() => useDialogState(initialFormData));
    
    act(() => {
      result.current.openDialog();
      result.current.updateFormData({ name: 'Jane' });
    });
    
    expect(result.current.formData.name).toBe('Jane');
    expect(result.current.formData.email).toBe('');
  });

  it('should close dialog and reset state', () => {
    const { result } = renderHook(() => useDialogState(initialFormData));
    const editItem = { id: '1', name: 'John', email: 'john@example.com' };
    
    act(() => {
      result.current.openDialog(editItem);
      result.current.closeDialog();
    });
    
    expect(result.current.isOpen).toBe(false);
    expect(result.current.editingItem).toBeNull();
    expect(result.current.formData).toEqual(initialFormData);
  });
});
