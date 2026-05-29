import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Hook to persist filter state in URL search parameters.
 * This ensures filters survive navigation (back button) and enables shareable URLs.
 * 
 * @param emptyFilters - The default empty state for filters
 * @param prefix - Optional prefix for URL params (e.g., "filter" -> "filter_name=John")
 * @returns [filters, setFilters, clearFilters]
 */
export function useUrlFilterState<T extends { [K in keyof T]: string }>(
  emptyFilters: T,
  prefix: string = "f"
): [T, (filters: T) => void, () => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  // Parse filters from URL on each render
  const filters = useMemo(() => {
    const result = { ...emptyFilters };
    const keys = Object.keys(emptyFilters) as (keyof T)[];
    
    for (const key of keys) {
      const paramKey = `${prefix}_${String(key)}`;
      const value = searchParams.get(paramKey);
      if (value !== null) {
        (result as any)[key] = value;
      }
    }
    
    return result;
  }, [searchParams, emptyFilters, prefix]);

  // Update URL with new filters
  const setFilters = useCallback((newFilters: T) => {
    setSearchParams((prev) => {
      const keys = Object.keys(emptyFilters) as (keyof T)[];
      
      for (const key of keys) {
        const paramKey = `${prefix}_${String(key)}`;
        const value = newFilters[key];
        
        if (value && value !== "") {
          prev.set(paramKey, value as string);
        } else {
          prev.delete(paramKey);
        }
      }
      
      return prev;
    }, { replace: true }); // Use replace to avoid polluting browser history
  }, [setSearchParams, emptyFilters, prefix]);

  // Clear all filter params from URL
  const clearFilters = useCallback(() => {
    setSearchParams((prev) => {
      const keys = Object.keys(emptyFilters) as (keyof T)[];
      
      for (const key of keys) {
        const paramKey = `${prefix}_${String(key)}`;
        prev.delete(paramKey);
      }
      
      return prev;
    }, { replace: true });
  }, [setSearchParams, emptyFilters, prefix]);

  return [filters, setFilters, clearFilters];
}
