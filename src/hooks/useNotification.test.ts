import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNotification } from './useNotification';
import { toast } from './use-toast';

vi.mock('./use-toast', () => ({
  toast: vi.fn(),
}));

describe('useNotification', () => {
  it('should call toast with correct params for success', () => {
    const { result } = renderHook(() => useNotification());
    
    result.current.success('Test Title', 'Test Description');
    
    expect(toast).toHaveBeenCalledWith({
      title: 'Test Title',
      description: 'Test Description',
    });
  });

  it('should call toast with destructive variant for error', () => {
    const { result } = renderHook(() => useNotification());
    const error = new Error('Test error');
    
    result.current.error('Error Title', error);
    
    expect(toast).toHaveBeenCalledWith({
      variant: 'destructive',
      title: 'Error Title',
      description: 'Test error',
    });
  });

  it('should handle error without message', () => {
    const { result } = renderHook(() => useNotification());
    
    result.current.error('Error Title');
    
    expect(toast).toHaveBeenCalledWith({
      variant: 'destructive',
      title: 'Error Title',
      description: 'An error occurred. Please try again.',
    });
  });

  it('should call toast with default variant for info', () => {
    const { result } = renderHook(() => useNotification());
    
    result.current.info('Info Title', 'Info Description');
    
    expect(toast).toHaveBeenCalledWith({
      title: 'Info Title',
      description: 'Info Description',
      variant: 'default',
    });
  });

  it('should handle confirm with window.confirm', () => {
    const { result } = renderHook(() => useNotification());
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    
    const confirmed = result.current.confirm('Are you sure?');
    
    expect(confirmSpy).toHaveBeenCalledWith('Are you sure?');
    expect(confirmed).toBe(true);
    
    confirmSpy.mockRestore();
  });
});
