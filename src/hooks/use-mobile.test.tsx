import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from './use-mobile';

describe('useIsMobile', () => {
  let matchMediaMock: any;

  beforeEach(() => {
    matchMediaMock = vi.fn();
    window.matchMedia = matchMediaMock;
  });

  it('should return false for desktop viewport', () => {
    const listeners: ((e: any) => void)[] = [];
    
    matchMediaMock.mockReturnValue({
      matches: false,
      addEventListener: (_: string, listener: any) => listeners.push(listener),
      removeEventListener: (_: string, listener: any) => {
        const index = listeners.indexOf(listener);
        if (index > -1) listeners.splice(index, 1);
      },
    });

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });

    const { result } = renderHook(() => useIsMobile());
    
    expect(result.current).toBe(false);
  });

  it('should return true for mobile viewport', () => {
    const listeners: ((e: any) => void)[] = [];
    
    matchMediaMock.mockReturnValue({
      matches: true,
      addEventListener: (_: string, listener: any) => listeners.push(listener),
      removeEventListener: (_: string, listener: any) => {
        const index = listeners.indexOf(listener);
        if (index > -1) listeners.splice(index, 1);
      },
    });

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });

    const { result } = renderHook(() => useIsMobile());
    
    expect(result.current).toBe(true);
  });

  it('should update on viewport change', () => {
    const listeners: ((e: any) => void)[] = [];
    
    matchMediaMock.mockReturnValue({
      matches: false,
      addEventListener: (_: string, listener: any) => listeners.push(listener),
      removeEventListener: (_: string, listener: any) => {
        const index = listeners.indexOf(listener);
        if (index > -1) listeners.splice(index, 1);
      },
    });

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });

    const { result, rerender } = renderHook(() => useIsMobile());
    
    expect(result.current).toBe(false);
    
    // Simulate viewport resize to mobile
    act(() => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });
      
      // Trigger the change event
      listeners.forEach(listener => listener({}));
    });

    rerender();
    
    expect(result.current).toBe(true);
  });
});
