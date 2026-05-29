import { useEffect, useRef, useState } from 'react';

interface UseAutoRefreshOptions {
  enabled?: boolean;
  intervalMs?: number;
  onRefresh: () => void;
}

/**
 * Hook to auto-refresh data at specified intervals
 * Default: 15 minutes (900000ms)
 */
export function useAutoRefresh({
  enabled = true,
  intervalMs = 900000, // 15 minutes
  onRefresh,
}: UseAutoRefreshOptions) {
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Set up interval
    intervalRef.current = setInterval(() => {
      onRefresh();
      setLastRefresh(new Date());
    }, intervalMs);

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, intervalMs, onRefresh]);

  const manualRefresh = () => {
    onRefresh();
    setLastRefresh(new Date());
  };

  return {
    lastRefresh,
    manualRefresh,
  };
}
