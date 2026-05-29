import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface QueryConfig {
  table: string;
  select?: string;
  filter?: Record<string, any>;
  count?: boolean;
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
}

interface ParallelQueryResult {
  data: any[] | null;
  count?: number | null;
  error: any;
}

/**
 * Hook for executing multiple parallel queries efficiently
 * Provides automatic caching, error handling, and loading states
 */
export function useParallelQueries(
  queries: QueryConfig[],
  orgId: string,
  options?: { enabled?: boolean }
): UseQueryResult<ParallelQueryResult[], Error> {
  return useQuery({
    queryKey: ['parallel-queries', orgId, queries],
    queryFn: async () => {
      if (!orgId) throw new Error("No organization context");

      const promises = queries.map(async (q) => {
        try {
          let query = supabase
            .from(q.table as any)
            .select(q.select || '*', q.count ? { count: 'exact' } : {})
            .eq('org_id', orgId);

          // Apply filters
          if (q.filter) {
            Object.entries(q.filter).forEach(([key, value]) => {
              query = query.eq(key, value);
            });
          }

          // Apply ordering
          if (q.orderBy) {
            query = query.order(q.orderBy.column, {
              ascending: q.orderBy.ascending ?? false,
            });
          }

          // Apply limit
          if (q.limit) {
            query = query.limit(q.limit);
          }

          const { data, error, count } = await query;
          
          return {
            data: error ? null : data,
            count: count ?? null,
            error,
          };
        } catch (error) {
          return {
            data: null,
            count: null,
            error,
          };
        }
      });

      return Promise.all(promises);
    },
    enabled: !!orgId && (options?.enabled !== false),
  });
}
