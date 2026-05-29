import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

/**
 * Automatic module usage tracking hook
 * 
 * Tracks user navigation across application modules for analytics and personalization.
 * Automatically logs visits to the user_module_usage table with timestamps and visit counts.
 * 
 * @remarks
 * - Runs automatically on route changes via useLocation
 * - Only tracks routes defined in MODULE_MAP
 * - Requires authenticated user with org_id
 * - Updates existing records or creates new ones
 * 
 * @example
 * ```tsx
 * // Add to root layout component
 * function DashboardLayout() {
 *   useModuleTracking(); // No parameters needed
 *   return <Outlet />;
 * }
 * ```
 * 
 * @see {@link useTopModules} To retrieve most visited modules
 */

// Map of routes to module information
const MODULE_MAP: Record<string, { key: string; name: string; icon: string; featureKey?: string }> = {
  '/dashboard': { key: 'dashboard', name: 'Dashboard', icon: 'LayoutDashboard', featureKey: 'dashboard' },
  '/contacts': { key: 'contacts', name: 'Contacts', icon: 'Contact', featureKey: 'contacts' },
  '/pipeline': { key: 'pipeline', name: 'Pipeline', icon: 'GitBranch', featureKey: 'pipeline_stages' },
  '/templates': { key: 'templates', name: 'Templates', icon: 'FileText', featureKey: 'templates' },
  '/email-campaigns': { key: 'email_campaigns', name: 'Campaigns', icon: 'Mail', featureKey: 'campaigns_email' },
  '/whatsapp-campaigns': { key: 'whatsapp_campaigns', name: 'WhatsApp', icon: 'MessageCircle', featureKey: 'campaigns_whatsapp' },
  '/communications': { key: 'communications', name: 'Comms', icon: 'MessageSquare', featureKey: 'communications' },
  '/reports': { key: 'reports', name: 'Reports', icon: 'BarChart3', featureKey: 'analytics' },
  '/forms': { key: 'forms', name: 'Forms', icon: 'FileText', featureKey: 'forms' },
  '/users': { key: 'users', name: 'Users', icon: 'Users', featureKey: 'users' },
  '/teams': { key: 'teams', name: 'Teams', icon: 'Users', featureKey: 'teams' },
  '/inventory': { key: 'inventory', name: 'Inventory', icon: 'Package', featureKey: 'inventory' },
  '/call-logs': { key: 'call_logs', name: 'Call Logs', icon: 'Phone', featureKey: 'calling' },
  '/whatsapp-dashboard': { key: 'whatsapp_dashboard', name: 'WhatsApp', icon: 'MessageCircle', featureKey: 'whatsapp' },
  '/api-keys': { key: 'api_keys', name: 'API Keys', icon: 'Key', featureKey: 'api_management' },
};

export const useModuleTracking = () => {
  const location = useLocation();

  useEffect(() => {
    const trackModuleUsage = async () => {
      const module = MODULE_MAP[location.pathname];
      if (!module) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .single();

      if (!profile?.org_id) return;

      // Try to increment existing record or insert new one
      const { data: existing } = await supabase
        .from('user_module_usage')
        .select('id, visit_count')
        .eq('user_id', user.id)
        .eq('module_key', module.key)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('user_module_usage')
          .update({
            visit_count: existing.visit_count + 1,
            last_visited_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('user_module_usage')
          .insert({
            user_id: user.id,
            org_id: profile.org_id,
            module_key: module.key,
            module_name: module.name,
            module_path: location.pathname,
            module_icon: module.icon,
            visit_count: 1,
          });
      }
    };

    trackModuleUsage();
  }, [location.pathname]);
};
