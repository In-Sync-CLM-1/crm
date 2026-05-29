import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNotification } from "@/hooks/useNotification";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Copy, Check, RefreshCw, Phone } from "lucide-react";
import { useOrgContext } from "@/hooks/useOrgContext";
import { LoadingState } from "@/components/common/LoadingState";

interface ExoPhone {
  sid: string;
  phoneNumber: string;
  friendlyName: string;
  capabilities: { voice: boolean; sms: boolean };
  numberType: string;
  region: string;
  country: string;
}

interface ExotelSettingsData {
  api_key: string;
  api_token: string;
  account_sid: string;
  subdomain: string;
  caller_id: string;
  call_recording_enabled: boolean;
  is_active: boolean;
}

const defaultSettings: ExotelSettingsData = {
  api_key: "",
  api_token: "",
  account_sid: "",
  subdomain: "api.exotel.com",
  caller_id: "",
  call_recording_enabled: true,
  is_active: true,
};

export default function ExotelSettings() {
  const notify = useNotification();
  const { effectiveOrgId } = useOrgContext();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [fetchingPhones, setFetchingPhones] = useState(false);
  const [exophones, setExophones] = useState<ExoPhone[]>([]);
  const [localSettings, setLocalSettings] = useState<ExotelSettingsData>(defaultSettings);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/exotel-webhook`;

  const { isLoading } = useQuery({
    queryKey: ['exotel-settings', effectiveOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exotel_settings')
        .select('*')
        .eq('org_id', effectiveOrgId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        const settings: ExotelSettingsData = {
          api_key: data.api_key || "",
          api_token: data.api_token || "",
          account_sid: data.account_sid || "",
          subdomain: data.subdomain || "api.exotel.com",
          caller_id: data.caller_id || "",
          call_recording_enabled: data.call_recording_enabled ?? true,
          is_active: data.is_active ?? true,
        };
        setLocalSettings(settings);
        return settings;
      }
      return defaultSettings;
    },
    enabled: !!effectiveOrgId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!localSettings.api_key || !localSettings.api_token || !localSettings.account_sid || !localSettings.caller_id) {
        throw new Error("Please fill in all required fields");
      }

      const { error } = await supabase
        .from('exotel_settings')
        .upsert({
          org_id: effectiveOrgId,
          ...localSettings,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exotel-settings', effectiveOrgId] });
      notify.success("Settings saved", "Exotel configuration has been updated");
    },
    onError: (error: Error) => {
      notify.error("Error", error.message);
    },
  });

  const fetchExophones = async () => {
    if (!localSettings.api_key || !localSettings.api_token || !localSettings.account_sid) {
      notify.error("Missing credentials", "Please fill in API Key, API Token, and Account SID first");
      return;
    }

    setFetchingPhones(true);
    try {
      const response = await supabase.functions.invoke('exotel-list-exophones', {
        body: { orgId: effectiveOrgId },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to fetch ExoPhones');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      setExophones(response.data?.exophones || []);
      
      if (response.data?.exophones?.length > 0) {
        notify.success("ExoPhones loaded", `Found ${response.data.exophones.length} ExoPhone(s)`);
      } else {
        notify.info("No ExoPhones", "No ExoPhones found in your Exotel account");
      }
    } catch (error: any) {
      console.error('Error fetching ExoPhones:', error);
      notify.error("Failed to fetch ExoPhones", error.message || "Please check your credentials");
    } finally {
      setFetchingPhones(false);
    }
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    notify.success("Copied!", "Webhook URL copied to clipboard");
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <LoadingState message="Loading Exotel settings..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Exotel Settings</h1>
          <p className="text-muted-foreground mt-2">
            Configure Exotel integration for calling functionality
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>API Credentials</CardTitle>
            <CardDescription>
              Enter your Exotel API credentials. You can find these in your Exotel dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="api_key">API Key *</Label>
                <Input
                  id="api_key"
                  type="password"
                  value={localSettings.api_key}
                  onChange={(e) => setLocalSettings({ ...localSettings, api_key: e.target.value })}
                  placeholder="Enter your Exotel API key"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="api_token">API Token *</Label>
                <Input
                  id="api_token"
                  type="password"
                  value={localSettings.api_token}
                  onChange={(e) => setLocalSettings({ ...localSettings, api_token: e.target.value })}
                  placeholder="Enter your Exotel API token"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="account_sid">Account SID *</Label>
                <Input
                  id="account_sid"
                  value={localSettings.account_sid}
                  onChange={(e) => setLocalSettings({ ...localSettings, account_sid: e.target.value })}
                  placeholder="Enter your Exotel Account SID"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subdomain">Subdomain</Label>
                <Input
                  id="subdomain"
                  value={localSettings.subdomain}
                  onChange={(e) => setLocalSettings({ ...localSettings, subdomain: e.target.value })}
                  placeholder="api.exotel.com"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              ExoPhone Selection
            </CardTitle>
            <CardDescription>
              Select your ExoPhone (virtual number) that will be used as the Caller ID for outbound calls
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={fetchExophones}
                disabled={fetchingPhones || !localSettings.api_key || !localSettings.api_token || !localSettings.account_sid}
              >
                {fetchingPhones ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Fetch Available ExoPhones
              </Button>
            </div>

            {exophones.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="caller_id">Select ExoPhone *</Label>
                <Select
                  value={localSettings.caller_id}
                  onValueChange={(value) => setLocalSettings({ ...localSettings, caller_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an ExoPhone" />
                  </SelectTrigger>
                  <SelectContent>
                    {exophones.map((phone) => (
                      <SelectItem key={phone.sid} value={phone.friendlyName}>
                        <div className="flex items-center gap-2">
                          <span>{phone.friendlyName}</span>
                          <span className="text-xs text-muted-foreground">
                            ({phone.numberType} - {phone.region})
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {exophones.length} ExoPhone(s) available in your account
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="caller_id">Caller ID (ExoPhone) *</Label>
                <Input
                  id="caller_id"
                  value={localSettings.caller_id}
                  onChange={(e) => setLocalSettings({ ...localSettings, caller_id: e.target.value })}
                  placeholder="Enter your ExoPhone number or fetch from Exotel"
                />
                <p className="text-xs text-muted-foreground">
                  Click "Fetch Available ExoPhones" to load numbers from your Exotel account, or enter manually
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Call Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="recording">Call Recording</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically record all calls
                </p>
              </div>
              <Switch
                id="recording"
                checked={localSettings.call_recording_enabled}
                onCheckedChange={(checked) =>
                  setLocalSettings({ ...localSettings, call_recording_enabled: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="space-y-1">
                <Label htmlFor="active">Active</Label>
                <p className="text-sm text-muted-foreground">
                  Enable Exotel integration
                </p>
              </div>
              <Switch
                id="active"
                checked={localSettings.is_active}
                onCheckedChange={(checked) =>
                  setLocalSettings({ ...localSettings, is_active: checked })
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Webhook Configuration</CardTitle>
            <CardDescription>
              This webhook URL is automatically included in all Exotel API calls (no configuration needed in Exotel portal)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={webhookUrl}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={copyWebhookUrl}
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              This webhook receives call status updates from Exotel
            </p>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Settings
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}