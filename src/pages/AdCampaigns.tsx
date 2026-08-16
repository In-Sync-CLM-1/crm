import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/common/LoadingState";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useNotification } from "@/hooks/useNotification";
import { CopyButton } from "@/components/common/CopyButton";
import { Pause, IndianRupee, Megaphone } from "lucide-react";

interface AdCampaign {
  id: string;
  channel: "google" | "meta";
  status: "active" | "completed" | "failed" | "paused";
  product_key: string | null;
  name: string;
  content_strategy_note: string | null;
  headlines: string[] | null;
  descriptions: string[] | null;
  keywords: { text: string; match_type: string }[] | null;
  primary_text: string | null;
  meta_headline: string | null;
  image_url: string | null;
  daily_budget: number;
  currency: string;
  launch_date: string;
  duration_days: number;
  end_date: string;
  error_message: string | null;
  created_at: string;
}

interface BudgetConfig {
  google?: { daily_budget: number; active: boolean };
  meta?: { daily_budget: number; active: boolean };
}

const inr = (n: number | null | undefined) =>
  n == null ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const STATUS_VARIANT: Record<AdCampaign["status"], "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  completed: "secondary",
  paused: "outline",
  failed: "destructive",
};

function BudgetPanel() {
  const { effectiveOrgId } = useOrgContext();

  const { data } = useQuery({
    queryKey: ["mkt-paid-ads-budget", effectiveOrgId],
    queryFn: async (): Promise<BudgetConfig> => {
      if (!effectiveOrgId) return {};
      const { data, error } = await supabase
        .from("mkt_engine_config")
        .select("config_value")
        .eq("org_id", effectiveOrgId)
        .eq("config_key", "paid_ads_budget")
        .maybeSingle();
      if (error) throw error;
      return (data?.config_value as BudgetConfig) ?? {};
    },
    enabled: !!effectiveOrgId,
  });

  const row = (label: string, ch?: { daily_budget: number; active: boolean }) => (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <IndianRupee className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm">{ch ? `${inr(ch.daily_budget)}/day` : "not set"}</span>
        <Badge variant={ch?.active ? "default" : "secondary"}>{ch?.active ? "active" : ch ? "paused" : "off"}</Badge>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget</CardTitle>
        <p className="text-xs text-muted-foreground">
          The only lever the engine can't pull itself. Set or change it in Arohan chat —
          e.g. "Ad Budget Google: 500" (₹/day), or "Ad Budget Meta: off" to pause a channel.
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {row("Google Ads", data?.google)}
        {row("Meta Ads", data?.meta)}
      </CardContent>
    </Card>
  );
}

function briefText(c: AdCampaign): string {
  if (c.channel === "google") {
    const lines = [`Campaign: ${c.name}`];
    if (c.headlines?.length) lines.push(`Headlines:\n${c.headlines.join("\n")}`);
    if (c.descriptions?.length) lines.push(`Descriptions:\n${c.descriptions.join("\n")}`);
    if (c.keywords?.length) lines.push(`Keywords:\n${c.keywords.map((k) => k.text).join(", ")}`);
    return lines.join("\n\n");
  }
  const lines = [`Campaign: ${c.name}`];
  if (c.meta_headline) lines.push(`Headline: ${c.meta_headline}`);
  if (c.primary_text) lines.push(`Primary text:\n${c.primary_text}`);
  return lines.join("\n\n");
}

function CampaignCard({ c }: { c: AdCampaign }) {
  const notify = useNotification();
  const queryClient = useQueryClient();

  const pause = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("mkt-ad-campaign-pause", {
        body: { campaign_id: c.id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      notify.success("Campaign paused", c.name);
      queryClient.invalidateQueries({ queryKey: ["mkt-ad-campaigns"] });
    },
    onError: (e: Error) => notify.error("Couldn't pause campaign", e.message),
  });

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{c.name}</span>
              <Badge variant="outline" className="capitalize">{c.channel === "google" ? "Google Ads" : "Meta Ads"}</Badge>
              <Badge variant={STATUS_VARIANT[c.status]} className="capitalize">{c.status}</Badge>
            </div>
            {c.content_strategy_note && (
              <p className="text-sm text-muted-foreground mt-1">{c.content_strategy_note}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <CopyButton text={briefText(c)} label="Copy brief" />
            {c.status === "active" && (
              <Button size="sm" variant="outline" disabled={pause.isPending} onClick={() => pause.mutate()}>
                <Pause className="h-3.5 w-3.5 mr-1" /> Pause
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><span className="text-muted-foreground">Budget</span><div className="font-medium">{inr(c.daily_budget)}/day</div></div>
          <div><span className="text-muted-foreground">Launch</span><div className="font-medium">{c.launch_date}</div></div>
          <div><span className="text-muted-foreground">Duration</span><div className="font-medium">{c.duration_days} days</div></div>
          <div><span className="text-muted-foreground">Ends</span><div className="font-medium">{c.end_date}</div></div>
        </div>

        {c.image_url && (
          <img src={c.image_url} alt={c.name} className="rounded-lg max-h-40 object-cover" />
        )}

        {c.channel === "google" ? (
          <div className="text-sm space-y-1">
            {c.headlines?.length ? <p><span className="text-muted-foreground">Headlines: </span>{c.headlines.join(" · ")}</p> : null}
            {c.descriptions?.length ? <p><span className="text-muted-foreground">Descriptions: </span>{c.descriptions.join(" · ")}</p> : null}
            {c.keywords?.length ? <p><span className="text-muted-foreground">Keywords: </span>{c.keywords.map((k) => k.text).join(", ")}</p> : null}
          </div>
        ) : (
          <div className="text-sm space-y-1">
            {c.meta_headline && <p className="font-medium">{c.meta_headline}</p>}
            {c.primary_text && <p className="text-muted-foreground">{c.primary_text}</p>}
          </div>
        )}

        {c.error_message && (
          <p className="text-sm text-destructive">{c.error_message}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdCampaigns() {
  const { effectiveOrgId } = useOrgContext();

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["mkt-ad-campaigns", effectiveOrgId],
    queryFn: async (): Promise<AdCampaign[]> => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("mkt_ad_campaigns")
        .select("*")
        .eq("org_id", effectiveOrgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as AdCampaign[];
    },
    enabled: !!effectiveOrgId,
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Ad Campaigns</h1>
          <p className="text-muted-foreground mt-1">
            Fully autonomous — Arohan writes, launches, and retires these on its own within your budget.
            This is a watch-and-intervene view, not an approval queue.
          </p>
        </div>

        <BudgetPanel />

        {isLoading ? (
          <LoadingState message="Loading campaigns..." />
        ) : !campaigns?.length ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground flex flex-col items-center gap-2">
              <Megaphone className="h-6 w-6" />
              No campaigns yet. Set a budget in Arohan chat and the engine will take it from there.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {campaigns.map((c) => <CampaignCard key={c.id} c={c} />)}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
