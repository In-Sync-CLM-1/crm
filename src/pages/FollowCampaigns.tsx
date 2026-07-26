import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/common/LoadingState";
import { useOrgContext } from "@/hooks/useOrgContext";
import { UserPlus, MailCheck, MousePointerClick, AlertTriangle } from "lucide-react";

/**
 * Follow Campaigns — the founder's one-to-one "please follow our page" sends.
 *
 * Two named campaigns, one per audience tier. The number that matters is
 * follow clicks: LinkedIn will not tell us who followed because of an email,
 * so a click on the follow button is the closest observable conversion. Post
 * reads are counted separately as interest, not success.
 *
 * Deliveries — not sends — are the daily target, so delivery rate is shown
 * against the 100/day/campaign goal rather than buried.
 */

const DAILY_DELIVERY_TARGET = 100;

interface CampaignStats {
  campaign_key: string;
  campaign_name: string;
  segment: string;
  total_people: number;
  queued: number;
  sent: number;
  delivered: number;
  opened: number;
  follow_clicks: number;
  post_reads: number;
  facebook_clicks: number;
  reminders_sent: number;
  bounced: number;
  unsubscribed: number;
  complained: number;
  failed: number;
  sent_today: number;
  delivered_today: number;
  first_sent_at: string | null;
  last_sent_at: string | null;
}

const num = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("en-IN");

const pct = (part: number, whole: number) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—";

/** A single headline number with its rate underneath. */
function Metric({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "warn";
}) {
  const toneClass =
    tone === "good" ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn" ? "text-amber-600 dark:text-amber-400"
      : "text-foreground";
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function CampaignCard({ c }: { c: CampaignStats }) {
  // Each tier is asked for exactly one network: decision-makers for the
  // LinkedIn page, practitioners for Facebook. So "follows" means a different
  // column per campaign, and only that one is the conversion.
  const onFacebook = c.segment === "individual";
  const follows = onFacebook ? c.facebook_clicks : c.follow_clicks;
  const network = onFacebook ? "Facebook" : "LinkedIn";

  const deliveryRate = c.sent > 0 ? c.delivered / c.sent : 0;
  const bounceRate = c.sent > 0 ? c.bounced / c.sent : 0;
  // Under ~95% delivery the list needs attention; over 2% bounce is a
  // reputation risk on a domain the whole product fleet sends from.
  const deliveryTone = c.sent === 0 ? "default" : deliveryRate >= 0.95 ? "good" : "warn";
  const bounceTone = bounceRate > 0.02 ? "warn" : "default";
  const targetMet = c.delivered_today >= DAILY_DELIVERY_TARGET;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{c.campaign_name}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">asks for {network}</Badge>
            <Badge variant={targetMet ? "default" : "secondary"}>
              {c.delivered_today} / {DAILY_DELIVERY_TARGET} delivered today
            </Badge>
            <Badge variant="outline">{num(c.queued)} queued</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label={`${network} follow clicks`}
            value={num(follows)}
            sub={`${pct(follows, c.delivered)} of delivered`}
            tone="good"
          />
          <Metric
            label="Delivered"
            value={num(c.delivered)}
            sub={`${pct(c.delivered, c.sent)} of ${num(c.sent)} sent`}
            tone={deliveryTone}
          />
          <Metric label="Opened" value={num(c.opened)} sub={`${pct(c.opened, c.delivered)} of delivered`} />
          <Metric label="Post reads" value={num(c.post_reads)} sub={`${pct(c.post_reads, c.delivered)} of delivered`} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Reminders sent" value={num(c.reminders_sent)} />
          <Metric label="Bounced" value={num(c.bounced)} sub={pct(c.bounced, c.sent)} tone={bounceTone} />
          <Metric
            label="Unsubscribed"
            value={num(c.unsubscribed)}
            sub={`${num(c.complained)} spam ${c.complained === 1 ? "report" : "reports"}`}
            tone={c.complained > 0 ? "warn" : "default"}
          />
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <span>{num(c.total_people)} people in campaign</span>
          {c.first_sent_at && <span>started {new Date(c.first_sent_at).toLocaleDateString("en-IN")}</span>}
          {c.last_sent_at && <span>last sent {new Date(c.last_sent_at).toLocaleDateString("en-IN")}</span>}
          {c.failed > 0 && <span className="text-amber-600 dark:text-amber-400">{num(c.failed)} send failures</span>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function FollowCampaigns() {
  const { effectiveOrgId } = useOrgContext();

  const { data, isLoading } = useQuery({
    queryKey: ["mkt-follow-campaign-stats", effectiveOrgId],
    queryFn: async (): Promise<CampaignStats[]> => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("mkt_follow_campaign_stats")
        .select("*")
        .eq("org_id", effectiveOrgId)
        .order("campaign_key");
      if (error) throw error;
      return (data ?? []) as CampaignStats[];
    },
    enabled: !!effectiveOrgId,
    refetchInterval: 60_000,
  });

  const totals = (data ?? []).reduce(
    (a, c) => ({
      delivered: a.delivered + c.delivered,
      // Count each campaign's own network — practitioners are asked for
      // Facebook, decision-makers for LinkedIn.
      follows: a.follows + (c.segment === "individual" ? c.facebook_clicks : c.follow_clicks),
      queued: a.queued + c.queued,
    }),
    { delivered: 0, follows: 0, queued: 0 },
  );

  return (
    <DashboardLayout>
      <div className="space-y-5 p-4 sm:p-6">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <UserPlus size={20} /> Follow Campaigns
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One-to-one emails from Amit asking people to follow the In-Sync pages. Nothing is sold.
            100 delivered per campaign per day, one reminder each at most.
          </p>
        </div>

        {isLoading ? (
          <LoadingState />
        ) : !data || data.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No campaign activity yet. The queue fills overnight and the first emails go out on the
              next daily send.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Follow clicks (all campaigns)" value={num(totals.follows)} tone="good" />
              <Metric
                label="Total delivered"
                value={num(totals.delivered)}
                sub={`${pct(totals.follows, totals.delivered)} clicked follow`}
              />
              <Metric label="Still queued" value={num(totals.queued)} />
            </div>

            <div className="space-y-4">
              {data.map((c) => (
                <CampaignCard key={c.campaign_key} c={c} />
              ))}
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <MousePointerClick size={15} /> How to read this
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs text-muted-foreground">
                <p>
                  <strong className="text-foreground">Each campaign asks for one network only.</strong>{" "}
                  Decision makers are asked for the LinkedIn page; practitioners are asked for Facebook
                  and are never pointed at LinkedIn, to keep that page's audience commercially useful.
                </p>
                <p>
                  <strong className="text-foreground">Follow clicks</strong> is the conversion metric.
                  Neither network reports who followed because of an email, so a click on the follow
                  button is the closest we can observe — actual page follower growth shows on the
                  Performance page.
                </p>
                <p>
                  <strong className="text-foreground">Post reads</strong> means they opened the linked
                  post. That is interest, not success, and those people still receive their reminder.
                </p>
                <p className="flex items-start gap-1.5">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span>
                    Bounce rate above 2% or any spam reports need attention — these send from
                    in-sync.co.in, the same domain as invoices and password resets.
                  </span>
                </p>
                <p className="flex items-start gap-1.5">
                  <MailCheck size={13} className="mt-0.5 shrink-0" />
                  <span>
                    The daily target counts deliveries, not sends. The sender overshoots to cover
                    bounces, capped at 1.6× the target.
                  </span>
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
