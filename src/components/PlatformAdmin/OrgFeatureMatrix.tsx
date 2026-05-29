import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Loader2, Crown } from "lucide-react";
import { toast } from "sonner";

export const OrgFeatureMatrix = () => {
  const queryClient = useQueryClient();
  const [updatingFeature, setUpdatingFeature] = useState<string | null>(null);

  const { data: organizations, isLoading: orgsLoading } = useQuery({
    queryKey: ["organizations-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, slug")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: features, isLoading: featuresLoading } = useQuery({
    queryKey: ["feature-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_permissions")
        .select("*")
        .order("category, feature_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: orgFeatureAccess, isLoading: accessLoading } = useQuery({
    queryKey: ["org-feature-access-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_feature_access")
        .select("*");
      if (error) throw error;
      return data;
    },
  });

  const toggleFeatureMutation = useMutation({
    mutationFn: async ({
      orgId,
      featureKey,
      isEnabled,
    }: {
      orgId: string;
      featureKey: string;
      isEnabled: boolean;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const existing = orgFeatureAccess?.find(
        a => a.org_id === orgId && a.feature_key === featureKey
      );

      if (existing) {
        const { error } = await supabase
          .from("org_feature_access")
          .update({
            is_enabled: isEnabled,
            [isEnabled ? 'enabled_at' : 'disabled_at']: new Date().toISOString(),
            modified_by: user?.id,
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("org_feature_access")
          .insert({
            org_id: orgId,
            feature_key: featureKey,
            is_enabled: isEnabled,
            [isEnabled ? 'enabled_at' : 'disabled_at']: new Date().toISOString(),
            modified_by: user?.id,
          });
        if (error) throw error;
      }

      // Log to audit trail
      await supabase.from("platform_admin_audit_log").insert({
        admin_id: user?.id,
        target_org_id: orgId,
        action: isEnabled ? 'enable_org_feature' : 'disable_org_feature',
        details: { feature_key: featureKey },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-feature-access-all"] });
      toast.success("Feature access updated");
    },
    onError: (error: any) => {
      toast.error(`Failed to update feature: ${error.message}`);
    },
    onSettled: () => {
      setUpdatingFeature(null);
    },
  });

  const isFeatureEnabledForOrg = (orgId: string, featureKey: string): boolean => {
    const access = orgFeatureAccess?.find(
      a => a.org_id === orgId && a.feature_key === featureKey
    );
    return access?.is_enabled ?? false;
  };

  const handleToggle = (orgId: string, featureKey: string, currentStatus: boolean) => {
    setUpdatingFeature(`${orgId}-${featureKey}`);
    toggleFeatureMutation.mutate({
      orgId,
      featureKey,
      isEnabled: !currentStatus,
    });
  };

  if (orgsLoading || featuresLoading || accessLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div 
        className="rounded-md border relative"
        style={{ 
          maxHeight: '500px', 
          overflow: 'auto',
        }}
      >
        <table className="w-full text-sm border-collapse" style={{ minWidth: 'max-content' }}>
          <thead className="sticky top-0 z-20 bg-background">
            <tr className="border-b">
              <th 
                className="h-12 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap bg-background border-r"
                style={{ 
                  position: 'sticky', 
                  left: 0, 
                  zIndex: 30,
                  minWidth: '200px',
                }}
              >
                Organization
              </th>
              {features?.map(feature => (
                <th 
                  key={feature.feature_key} 
                  className="h-12 px-4 text-center align-middle font-medium text-muted-foreground min-w-[120px] bg-background"
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs whitespace-nowrap">{feature.feature_name}</span>
                    {feature.is_premium && (
                      <Crown className="h-3 w-3 text-yellow-500" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {organizations?.map(org => (
              <tr key={org.id} className="border-b transition-colors hover:bg-muted/50">
                <td 
                  className="p-4 align-middle font-medium whitespace-nowrap bg-background border-r"
                  style={{ 
                    position: 'sticky', 
                    left: 0, 
                    zIndex: 10,
                    minWidth: '200px',
                  }}
                >
                  {org.name}
                </td>
                {features?.map(feature => {
                  const isEnabled = isFeatureEnabledForOrg(org.id, feature.feature_key);
                  const isUpdating = updatingFeature === `${org.id}-${feature.feature_key}`;
                  
                  return (
                    <td key={feature.feature_key} className="p-4 align-middle text-center">
                      {isUpdating ? (
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      ) : (
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={() => handleToggle(org.id, feature.feature_key, isEnabled)}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-yellow-500" />
          <span>Premium Feature</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked disabled />
          <span>Enabled</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={false} disabled />
          <span>Disabled</span>
        </div>
      </div>
    </div>
  );
};