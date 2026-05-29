import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoRefresh } from './useAutoRefresh';

describe('useAutoRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call onRefresh at specified intervals', () => {
    const onRefresh = vi.fn();
    
    renderHook(() => useAutoRefresh({
      enabled: true,
      intervalMs: 1000,
      onRefresh,
    }));
    
    expect(onRefresh).not.toHaveBeenCalled();
    
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    
    expect(onRefresh).toHaveBeenCalledTimes(1);
    
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    
    expect(onRefresh).toHaveBeenCalledTimes(3);
  });

  it('should not refresh when disabled', () => {
    const onRefresh = vi.fn();
    
    renderHook(() => useAutoRefresh({
      enabled: false,
      intervalMs: 1000,
      onRefresh,
    }));
    
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('should allow manual refresh', () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => useAutoRefresh({
      enabled: true,
      intervalMs: 10000,
      onRefresh,
    }));
    
    act(() => {
      result.current.manualRefresh();
    });
    
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(result.current.lastRefresh).toBeInstanceOf(Date);
  });

  it('should clean up interval on unmount', () => {
    const onRefresh = vi.fn();
    const { unmount } = renderHook(() => useAutoRefresh({
      enabled: true,
      intervalMs: 1000,
      onRefresh,
    }));
    
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    
    expect(onRefresh).toHaveBeenCalledTimes(1);
    
    unmount();
    
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    
    expect(onRefresh).toHaveBeenCalledTimes(1); // Should not increase after unmount
  });
});
