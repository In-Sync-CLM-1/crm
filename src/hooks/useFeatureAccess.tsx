import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "./useOrgContext";

interface FeatureAccess {
  isFeatureEnabled: (featureKey: string) => boolean;
  hasPermission: (featureKey: string, permission: 'view' | 'create' | 'edit' | 'delete') => boolean;
  canAccessFeature: (featureKey: string) => boolean;
  loading: boolean;
}

export const useFeatureAccess = (): FeatureAccess => {
  const { effectiveOrgId, isPlatformAdmin } = useOrgContext();

  // Fetch org feature access
  const { data: orgFeatures, isLoading: orgLoading } = useQuery({
    queryKey: ["org-feature-access", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("org_feature_access")
        .select("*")
        .eq("org_id", effectiveOrgId);
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId,
  });

  // Fetch user's designation
  const { data: userProfile, isLoading: profileLoading } = useQuery({
    queryKey: ["user-designation"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("designation_id")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch designation permissions
  const { data: designationPermissions, isLoading: permissionsLoading } = useQuery({
    queryKey: ["designation-permissions", userProfile?.designation_id],
    queryFn: async () => {
      if (!userProfile?.designation_id) return [];
      const { data, error } = await supabase
        .from("designation_feature_access")
        .select("*")
        .eq("designation_id", userProfile.designation_id);
      if (error) throw error;
      return data;
    },
    enabled: !!userProfile?.designation_id,
  });

  const isFeatureEnabled = (featureKey: string): boolean => {
    // Platform admins bypass all restrictions
    if (isPlatformAdmin) return true;
    
    // Check org-level feature access
    const orgFeature = orgFeatures?.find(f => f.feature_key === featureKey);
    
    // If no org feature record exists, check if it's in the default allowed list
    const defaultAllowedFeatures = ['dashboard']; // Only dashboard is always accessible
    if (!orgFeature) {
      return defaultAllowedFeatures.includes(featureKey);
    }
    
    // Otherwise, use the org's setting
    return orgFeature.is_enabled;
  };

  const hasPermission = (
    featureKey: string,
    permission: 'view' | 'create' | 'edit' | 'delete'
  ): boolean => {
    // Platform admins bypass all restrictions
    if (isPlatformAdmin) return true;
    
    // Check designation-level permissions
    const designationPermission = designationPermissions?.find(
      p => p.feature_key === featureKey
    );
    
    if (!designationPermission) return true; // Default: allow if not restricted
    
    const permissionMap = {
      view: designationPermission.can_view,
      create: designationPermission.can_create,
      edit: designationPermission.can_edit,
      delete: designationPermission.can_delete,
    };
    
    return permissionMap[permission] ?? false;
  };

  const canAccessFeature = (featureKey: string): boolean => {
    return isFeatureEnabled(featureKey) && hasPermission(featureKey, 'view');
  };

  return {
    isFeatureEnabled,
    hasPermission,
    canAccessFeature,
    loading: orgLoading || profileLoading || permissionsLoading,
  };
};
