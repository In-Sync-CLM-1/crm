import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNotification } from "@/hooks/useNotification";
import { useOrgContext } from "@/hooks/useOrgContext";
import { LoadingState } from "@/components/common/LoadingState";
import { Save, Key, Shield, Zap, Calendar, BarChart3 } from "lucide-react";

interface ApolloConfig {
  auto_enrich_enabled?: boolean;
  enrich_on_create?: boolean;
  enrich_on_email_change?: boolean;
  default_reveal_phone?: boolean;
  default_reveal_email?: boolean;
  scheduled_enrichment_enabled?: boolean;
  enrichment_frequency?: 'daily' | 'weekly' | 'monthly';
  enrichment_strategy?: 'new_only' | 'all' | 're_enrich_after_days';
  re_enrich_after_days?: number;
  daily_enrichment_limit?: number;
}

interface EnrichmentRun {
  id: string;
  started_at: string;
  completed_at: string | null;
  contacts_processed: number;
  contacts_enriched: number;
  contacts_failed: number;
  status: string;
}

const defaultConfig: ApolloConfig = {
  auto_enrich_enabled: false,
  enrich_on_create: false,
  enrich_on_email_change: false,
  default_reveal_phone: false,
  default_reveal_email: false,
  scheduled_enrichment_enabled: false,
  enrichment_frequency: 'daily',
  enrichment_strategy: 'new_only',
  re_enrich_after_days: 30,
  daily_enrichment_limit: 100,
};

export default function ApolloSettings() {
  const { effectiveOrgId } = useOrgContext();
  const notify = useNotification();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<ApolloConfig>(defaultConfig);

  const { data: apolloData, isLoading } = useQuery({
    queryKey: ['apollo-settings', effectiveOrgId],
    queryFn: async () => {
      // Fetch settings
      const settingsRes = await supabase
        .from('organizations')
        .select('apollo_config')
        .eq('id', effectiveOrgId)
        .single();

      if (settingsRes.error) throw settingsRes.error;

      let apolloConfig = defaultConfig;
      if (settingsRes.data?.apollo_config) {
        apolloConfig = {
          ...defaultConfig,
          ...(settingsRes.data.apollo_config as any),
        };
        setConfig(apolloConfig);
      }

      // Try to fetch last enrichment run
      let lastRun: EnrichmentRun | null = null;
      try {
        const runRes = await supabase
          .from('contact_enrichment_runs')
          .select('*')
          .eq('org_id', effectiveOrgId)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (runRes.data) {
          lastRun = runRes.data as EnrichmentRun;
        }
      } catch {
        // Table doesn't exist yet, ignore
      }

      return { config: apolloConfig, lastRun };
    },
    enabled: !!effectiveOrgId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('organizations')
        .update({ apollo_config: config as any })
        .eq('id', effectiveOrgId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apollo-settings', effectiveOrgId] });
      notify.success("Settings saved", "Your Apollo settings have been updated successfully.");
    },
    onError: (error: Error) => {
      notify.error("Error", error.message);
    },
  });

  const lastRun = apolloData?.lastRun;

  if (isLoading) {
    return (
      <DashboardLayout>
        <LoadingState message="Loading Apollo settings..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Apollo Data Enrichment Settings</h1>
          <p className="text-muted-foreground">
            Configure Apollo.io automatic data enrichment and scheduling
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API Configuration
            </CardTitle>
            <CardDescription>
              Your Apollo.io API key is securely stored as a secret
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-1">
                <p className="font-medium">API Key Status</p>
                <p className="text-sm text-muted-foreground">
                  Configured via environment secrets
                </p>
              </div>
              <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
                Active
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Auto-Enrichment
            </CardTitle>
            <CardDescription>
              Automatically enrich contacts when certain events occur
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto_enrich_enabled">Enable Auto-Enrichment</Label>
                <p className="text-sm text-muted-foreground">
                  Trigger enrichment automatically based on rules below
                </p>
              </div>
              <Switch
                id="auto_enrich_enabled"
                checked={config.auto_enrich_enabled}
                onCheckedChange={(checked) =>
                  setConfig({ ...config, auto_enrich_enabled: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="enrich_on_create">Enrich on Contact Creation</Label>
                <p className="text-sm text-muted-foreground">
                  Enrich contacts automatically when they are created
                </p>
              </div>
              <Switch
                id="enrich_on_create"
                checked={config.enrich_on_create}
                onCheckedChange={(checked) =>
                  setConfig({ ...config, enrich_on_create: checked })
                }
                disabled={!config.auto_enrich_enabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="enrich_on_email_change">Enrich on Email Change</Label>
                <p className="text-sm text-muted-foreground">
                  Re-enrich contacts when their email address is updated
                </p>
              </div>
              <Switch
                id="enrich_on_email_change"
                checked={config.enrich_on_email_change}
                onCheckedChange={(checked) =>
                  setConfig({ ...config, enrich_on_email_change: checked })
                }
                disabled={!config.auto_enrich_enabled}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Default Reveal Settings
            </CardTitle>
            <CardDescription>
              Configure what information to reveal during enrichment (uses additional credits)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="default_reveal_phone">Reveal Phone Numbers by Default</Label>
                <p className="text-sm text-muted-foreground">
                  When enabled, phone numbers will be revealed during enrichment (uses additional credits)
                </p>
              </div>
              <Switch
                id="default_reveal_phone"
                checked={config.default_reveal_phone}
                onCheckedChange={(checked) =>
                  setConfig({ ...config, default_reveal_phone: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="default_reveal_email">Reveal Personal Emails by Default</Label>
                <p className="text-sm text-muted-foreground">
                  When enabled, personal emails will be revealed during enrichment (uses additional credits)
                </p>
              </div>
              <Switch
                id="default_reveal_email"
                checked={config.default_reveal_email}
                onCheckedChange={(checked) =>
                  setConfig({ ...config, default_reveal_email: checked })
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Scheduled Enrichment
            </CardTitle>
            <CardDescription>
              Automatically enrich contacts in the background on a schedule
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="scheduled_enrichment_enabled">Enable Scheduled Enrichment</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically enrich contacts daily without manual intervention
                </p>
              </div>
              <Switch
                id="scheduled_enrichment_enabled"
                checked={config.scheduled_enrichment_enabled}
                onCheckedChange={(checked) =>
                  setConfig({ ...config, scheduled_enrichment_enabled: checked })
                }
              />
            </div>

            {config.scheduled_enrichment_enabled && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="enrichment_strategy">Enrichment Strategy</Label>
                  <Select
                    value={config.enrichment_strategy}
                    onValueChange={(value: any) =>
                      setConfig({ ...config, enrichment_strategy: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new_only">New contacts only</SelectItem>
                      <SelectItem value="re_enrich_after_days">Re-enrich after X days</SelectItem>
                      <SelectItem value="all">All contacts</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    {config.enrichment_strategy === 'new_only' && 'Only enrich contacts that have never been enriched'}
                    {config.enrichment_strategy === 're_enrich_after_days' && 'Re-enrich contacts after a specified number of days'}
                    {config.enrichment_strategy === 'all' && 'Enrich all contacts every time (uses most credits)'}
                  </p>
                </div>

                {config.enrichment_strategy === 're_enrich_after_days' && (
                  <div className="space-y-2">
                    <Label htmlFor="re_enrich_after_days">Re-enrich After Days</Label>
                    <Input
                      id="re_enrich_after_days"
                      type="number"
                      min="1"
                      value={config.re_enrich_after_days}
                      onChange={(e) =>
                        setConfig({ ...config, re_enrich_after_days: parseInt(e.target.value) || 30 })
                      }
                    />
                    <p className="text-sm text-muted-foreground">
                      Re-enrich contacts after this many days since last enrichment
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="daily_enrichment_limit">Daily Enrichment Limit</Label>
                  <Input
                    id="daily_enrichment_limit"
                    type="number"
                    min="1"
                    value={config.daily_enrichment_limit}
                    onChange={(e) =>
                      setConfig({ ...config, daily_enrichment_limit: parseInt(e.target.value) || 100 })
                    }
                  />
                  <p className="text-sm text-muted-foreground">
                    Maximum number of contacts to enrich per day (to control costs)
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {lastRun && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Last Enrichment Run
              </CardTitle>
              <CardDescription>
                Status of the most recent scheduled enrichment
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Started</p>
                  <p className="font-medium">{new Date(lastRun.started_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <p className="font-medium capitalize">{lastRun.status}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Contacts Enriched</p>
                  <p className="font-medium">{lastRun.contacts_enriched}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Failed</p>
                  <p className="font-medium">{lastRun.contacts_failed}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {saveMutation.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
