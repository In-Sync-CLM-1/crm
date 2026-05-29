import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Module usage data for personalized navigation
 */
export interface TopModule {
  module_key: string;
  module_name: string;
  module_path: string;
  module_icon: string;
  visit_count: number;
}

/**
 * Fetch user's most frequently visited modules
 * 
 * Retrieves top N modules based on visit count and recency, useful for
 * quick access navigation and personalized dashboards.
 * 
 * @param {number} [limit=6] - Maximum number of modules to return
 * 
 * @returns React Query result with module data
 * 
 * @example
 * ```tsx
 * const { data: topModules, isLoading } = useTopModules(8);
 * 
 * return (
 *   <div>
 *     {topModules?.map(mod => (
 *       <Link to={mod.module_path}>{mod.module_name}</Link>
 *     ))}
 *   </div>
 * );
 * ```
 */
export const useTopModules = (limit: number = 6) => {
  return useQuery({
    queryKey: ['top-modules', limit],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('user_module_usage')
        .select('module_key, module_name, module_path, module_icon, visit_count')
        .eq('user_id', user.id)
        .order('visit_count', { ascending: false })
        .order('last_visited_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching top modules:', error);
        return [];
      }

      return data as TopModule[];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};
