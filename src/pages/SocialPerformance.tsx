import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/common/LoadingState";
import { useOrgContext } from "@/hooks/useOrgContext";
import { EChart } from "@/components/Marketing/EChart";
import { ArrowDownRight, ArrowUpRight, Bot, ExternalLink, ImageIcon, LayoutGrid, Minus, Send, Type, Video } from "lucide-react";
import type { EChartsOption } from "echarts";
import { themeLabel } from "@/lib/contentSchedule";

/**
 * Social Performance — always-on view of how the content pipeline is doing
 * across LinkedIn / Facebook / Instagram: follower growth, interactions,
 * reach, what formats and themes work, and the top posts. "Ask Arohan"
 * hands any deeper question to the AI analytics chat.
 *
 * Chart colors: validated 4-slot categorical palette (dataviz reference,
 * fixed order — color follows the channel, never rank). No bar charts by
 * design (user preference): lines, donut, ranked lists.
 */

// Fixed channel → color assignment (light-mode steps)
const CHANNEL_COLOR: Record<string, string> = {
  LinkedIn: "#2a78d6",
  Facebook: "#008300",
  Instagram: "#e87ba4",
  YouTube: "#eda100",
};
const FORMAT_COLOR: Record<string, string> = {
  text: "#2a78d6",
  image: "#008300",
  carousel: "#e87ba4",
  video: "#eda100",
};
const INK = { primary: "#0b0b0b", secondary: "#52514e", muted: "#898781", grid: "#e1e0d9", axis: "#c3c2b7" };

const formatIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  text: Type,
  image: ImageIcon,
  video: Video,
  carousel: LayoutGrid,
};

interface PerfPost {
  id: string;
  blog_title: string | null;
  publish_date: string;
  post_format: string | null;
  content_theme: string | null;
  product_key: string | null;
  status: string;
  linkedin_url: string | null;
  linkedin_impressions: number | null;
  linkedin_likes: number | null;
  linkedin_comments: number | null;
  linkedin_reposts: number | null;
  fb_post_id: string | null;
  fb_likes: number | null;
  fb_comments: number | null;
  fb_shares: number | null;
  fb_clicks: number | null;
  ig_post_id: string | null;
  ig_reel_id: string | null;
  ig_reach: number | null;
  ig_likes: number | null;
  ig_comments: number | null;
  ig_saves: number | null;
  ig_shares: number | null;
  yt_video_id: string | null;
  yt_views: number | null;
  yt_likes: number | null;
  yt_comments: number | null;
}

const n = (v: number | null | undefined) => v ?? 0;
const liInteractions = (p: PerfPost) => n(p.linkedin_likes) + n(p.linkedin_comments) + n(p.linkedin_reposts);
const fbInteractions = (p: PerfPost) => n(p.fb_likes) + n(p.fb_comments) + n(p.fb_shares);
const igInteractions = (p: PerfPost) => n(p.ig_likes) + n(p.ig_comments) + n(p.ig_saves) + n(p.ig_shares);
const ytInteractions = (p: PerfPost) => n(p.yt_likes) + n(p.yt_comments);
const totalInteractions = (p: PerfPost) => liInteractions(p) + fbInteractions(p) + igInteractions(p) + ytInteractions(p);
const totalReach = (p: PerfPost) => n(p.linkedin_impressions) + n(p.ig_reach) + n(p.yt_views);

function pctDelta(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function Delta({ value, suffix = "%" }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Minus className="h-3 w-3" /> n/a</span>;
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  const cls = value >= 0 ? "text-green-700" : "text-red-600";
  return (
    <span className={`text-xs font-medium flex items-center gap-0.5 ${cls}`}>
      <Icon className="h-3 w-3" />
      {value >= 0 ? "+" : ""}{value}{suffix}
    </span>
  );
}

function StatTile({ label, value, delta, deltaSuffix, sub }: { label: string; value: string; delta?: number | null; deltaSuffix?: string; sub?: string }) {
  return (
    <Card className="p-4 flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      <div className="flex items-center gap-2">
        {delta !== undefined && <Delta value={delta} suffix={deltaSuffix} />}
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
    </Card>
  );
}

const RANGES = [7, 30, 90] as const;

export default function SocialPerformance() {
  const { effectiveOrgId } = useOrgContext();
  const navigate = useNavigate();
  const [rangeDays, setRangeDays] = useState<(typeof RANGES)[number]>(30);
  const [question, setQuestion] = useState("");

  const since = format(subDays(new Date(), rangeDays), "yyyy-MM-dd");
  const prevSince = format(subDays(new Date(), rangeDays * 2), "yyyy-MM-dd");

  const { data: posts, isLoading } = useQuery({
    queryKey: ["social-perf-posts", effectiveOrgId, prevSince],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("blog_posts")
        .select("id, blog_title, publish_date, post_format, content_theme, product_key, status, linkedin_url, linkedin_impressions, linkedin_likes, linkedin_comments, linkedin_reposts, fb_post_id, fb_likes, fb_comments, fb_shares, fb_clicks, ig_post_id, ig_reel_id, ig_reach, ig_likes, ig_comments, ig_saves, ig_shares, yt_video_id, yt_views, yt_likes, yt_comments")
        .eq("org_id", effectiveOrgId)
        .eq("status", "posted")
        .gte("publish_date", prevSince)
        .order("publish_date", { ascending: true });
      if (error) throw error;
      return data as PerfPost[];
    },
    enabled: !!effectiveOrgId,
  });

  const { data: followerRows } = useQuery({
    queryKey: ["social-perf-followers", effectiveOrgId, since],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      // Table added 2026-07-18; not yet in generated types
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("mkt_channel_stats_daily")
        .select("stat_date, channel, followers")
        .eq("org_id", effectiveOrgId)
        .gte("stat_date", since)
        .order("stat_date", { ascending: true });
      if (error) throw error;
      return data as { stat_date: string; channel: string; followers: number | null }[];
    },
    enabled: !!effectiveOrgId,
  });

  const model = useMemo(() => {
    const all = posts || [];
    const current = all.filter((p) => p.publish_date >= since);
    const previous = all.filter((p) => p.publish_date < since);

    const days: string[] = [];
    for (let i = rangeDays - 1; i >= 0; i--) days.push(format(subDays(new Date(), i), "yyyy-MM-dd"));

    const byDay = (sel: (p: PerfPost) => number) => {
      const map = new Map<string, number>(days.map((d) => [d, 0]));
      for (const p of current) {
        if (map.has(p.publish_date)) map.set(p.publish_date, (map.get(p.publish_date) || 0) + sel(p));
      }
      return days.map((d) => map.get(d) || 0);
    };

    const sum = (arr: PerfPost[], sel: (p: PerfPost) => number) => arr.reduce((s, p) => s + sel(p), 0);

    const byFormat = new Map<string, { interactions: number; posts: number }>();
    const byTheme = new Map<string, { interactions: number; posts: number }>();
    for (const p of current) {
      const f = p.post_format || "text";
      const t = p.content_theme || "—";
      byFormat.set(f, { interactions: (byFormat.get(f)?.interactions || 0) + totalInteractions(p), posts: (byFormat.get(f)?.posts || 0) + 1 });
      byTheme.set(t, { interactions: (byTheme.get(t)?.interactions || 0) + totalInteractions(p), posts: (byTheme.get(t)?.posts || 0) + 1 });
    }

    const topPosts = [...current]
      .map((p) => ({ ...p, interactions: totalInteractions(p), reach: totalReach(p) }))
      .sort((a, b) => b.interactions - a.interactions || b.reach - a.reach)
      .slice(0, 8);

    const followerSeries = new Map<string, { dates: string[]; values: number[] }>();
    for (const row of followerRows || []) {
      const name = row.channel === "linkedin" ? "LinkedIn" : row.channel === "facebook" ? "Facebook" : row.channel === "instagram" ? "Instagram" : row.channel === "youtube" ? "YouTube" : row.channel;
      if (!followerSeries.has(name)) followerSeries.set(name, { dates: [], values: [] });
      const s = followerSeries.get(name)!;
      s.dates.push(row.stat_date);
      s.values.push(row.followers ?? 0);
    }
    const latestFollowers = (name: string) => {
      const s = followerSeries.get(name);
      return s?.values.length ? s.values[s.values.length - 1] : null;
    };
    const followerDelta = (name: string) => {
      const s = followerSeries.get(name);
      if (!s || s.values.length < 2) return null;
      return s.values[s.values.length - 1] - s.values[0];
    };

    return {
      days,
      interactionsTotal: sum(current, totalInteractions),
      interactionsDelta: pctDelta(sum(current, totalInteractions), sum(previous, totalInteractions)),
      reachTotal: sum(current, totalReach),
      reachDelta: pctDelta(sum(current, totalReach), sum(previous, totalReach)),
      postsCount: current.length,
      interactionsByChannel: {
        LinkedIn: byDay(liInteractions),
        Facebook: byDay(fbInteractions),
        Instagram: byDay(igInteractions),
        YouTube: byDay(ytInteractions),
      },
      reachByChannel: {
        LinkedIn: byDay((p) => n(p.linkedin_impressions)),
        Instagram: byDay((p) => n(p.ig_reach)),
        YouTube: byDay((p) => n(p.yt_views)),
      },
      byFormat,
      byTheme,
      topPosts,
      followerSeries,
      latestFollowers,
      followerDelta,
    };
  }, [posts, followerRows, since, rangeDays]);

  const axisCommon = {
    axisLine: { lineStyle: { color: INK.axis } },
    axisLabel: { color: INK.muted, fontSize: 11 },
    splitLine: { lineStyle: { color: INK.grid } },
  };

  const lineChart = (seriesMap: Record<string, number[]>, opts?: { area?: boolean }): EChartsOption => ({
    color: Object.keys(seriesMap).map((k) => CHANNEL_COLOR[k] || INK.muted),
    grid: { left: 44, right: 16, top: 30, bottom: 28 },
    legend: { top: 0, left: 0, icon: "circle", itemWidth: 8, itemHeight: 8, textStyle: { color: INK.secondary, fontSize: 11 } },
    tooltip: { trigger: "axis", axisPointer: { type: "cross", label: { show: false } } },
    xAxis: { type: "category", boundaryGap: false, data: model.days.map((d) => format(new Date(d + "T00:00:00"), "d MMM")), ...axisCommon, splitLine: { show: false } },
    yAxis: { type: "value", minInterval: 1, ...axisCommon, axisLine: { show: false } },
    series: Object.entries(seriesMap).map(([name, data]) => ({
      name,
      type: "line",
      smooth: true,
      symbol: "circle",
      symbolSize: 5,
      showSymbol: false,
      lineStyle: { width: 2 },
      emphasis: { focus: "series" },
      ...(opts?.area ? { areaStyle: { opacity: 0.08 } } : {}),
      data,
    })),
  });

  const followerChart = (): EChartsOption => {
    const entries = [...model.followerSeries.entries()];
    return {
      color: entries.map(([name]) => CHANNEL_COLOR[name] || INK.muted),
      grid: { left: 44, right: 16, top: 30, bottom: 28 },
      legend: { top: 0, left: 0, icon: "circle", itemWidth: 8, itemHeight: 8, textStyle: { color: INK.secondary, fontSize: 11 } },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", boundaryGap: false, data: entries[0]?.[1].dates.map((d) => format(new Date(d + "T00:00:00"), "d MMM")) || [], ...axisCommon, splitLine: { show: false } },
      yAxis: { type: "value", minInterval: 1, ...axisCommon, axisLine: { show: false } },
      series: entries.map(([name, s]) => ({
        name,
        type: "line",
        smooth: true,
        symbol: "circle",
        symbolSize: 5,
        showSymbol: false,
        lineStyle: { width: 2 },
        data: s.values,
      })),
    };
  };

  const formatDonut = (): EChartsOption => ({
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    legend: { bottom: 0, left: "center", icon: "circle", itemWidth: 8, itemHeight: 8, textStyle: { color: INK.secondary, fontSize: 11 } },
    series: [{
      type: "pie",
      radius: ["55%", "78%"],
      center: ["50%", "44%"],
      itemStyle: { borderColor: "#fff", borderWidth: 2 },
      label: { show: false },
      data: [...model.byFormat.entries()].map(([fmt, v]) => ({
        name: fmt,
        value: v.interactions,
        itemStyle: { color: FORMAT_COLOR[fmt] || INK.muted },
      })),
    }],
  });

  const askArohan = (q: string) => {
    navigate("/marketing/arohan", { state: { prefill: q } });
  };

  if (isLoading) return <DashboardLayout><LoadingState /></DashboardLayout>;

  const themeRows = [...model.byTheme.entries()]
    .map(([theme, v]) => ({ theme, ...v, avg: v.posts ? Math.round((v.interactions / v.posts) * 10) / 10 : 0 }))
    .sort((a, b) => b.avg - a.avg);

  return (
    <DashboardLayout>
      <div className="p-4 lg:p-6 space-y-4 max-w-[1400px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Social Performance</h1>
            <p className="text-sm text-muted-foreground">LinkedIn · Facebook · Instagram · YouTube — updated nightly.</p>
          </div>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <Button key={r} size="sm" variant={rangeDays === r ? "default" : "outline"} onClick={() => setRangeDays(r)}>
                {r}d
              </Button>
            ))}
          </div>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatTile label={`Interactions (${rangeDays}d)`} value={String(model.interactionsTotal)} delta={model.interactionsDelta} sub="vs prior period" />
          <StatTile label={`Reach (${rangeDays}d)`} value={String(model.reachTotal)} delta={model.reachDelta} sub="vs prior period" />
          <StatTile label="Posts published" value={String(model.postsCount)} />
          {(["LinkedIn", "Facebook", "Instagram", "YouTube"] as const).map((ch) => (
            <StatTile
              key={ch}
              label={`${ch} followers`}
              value={model.latestFollowers(ch) === null ? "—" : String(model.latestFollowers(ch))}
              delta={model.followerDelta(ch)}
              deltaSuffix=""
              sub={model.latestFollowers(ch) === null ? "first snapshot tonight" : `in ${rangeDays}d`}
            />
          ))}
        </div>

        {/* Trends */}
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <h2 className="text-sm font-medium mb-1">Interactions per day</h2>
            <p className="text-xs text-muted-foreground mb-2">Likes + comments + shares/saves, by channel</p>
            <EChart option={lineChart(model.interactionsByChannel, { area: true })} />
          </Card>
          <Card className="p-4">
            <h2 className="text-sm font-medium mb-1">Reach per day</h2>
            <p className="text-xs text-muted-foreground mb-2">LinkedIn impressions + Instagram reach (Facebook doesn't report post views)</p>
            <EChart option={lineChart(model.reachByChannel)} />
          </Card>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="p-4 lg:col-span-2">
            <h2 className="text-sm font-medium mb-1">Follower growth</h2>
            <p className="text-xs text-muted-foreground mb-2">Daily snapshots start tonight — the trend fills in from here</p>
            {model.followerSeries.size ? (
              <EChart option={followerChart()} />
            ) : (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">No snapshots yet — first one lands tonight at 22:30 IST</div>
            )}
          </Card>
          <Card className="p-4">
            <h2 className="text-sm font-medium mb-1">Interactions by format</h2>
            <p className="text-xs text-muted-foreground mb-2">Where engagement comes from</p>
            <EChart option={formatDonut()} />
          </Card>
        </div>

        {/* Themes + top posts */}
        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="p-4">
            <h2 className="text-sm font-medium mb-3">Story pillars by avg interactions/post</h2>
            <div className="space-y-2">
              {themeRows.length === 0 && <p className="text-sm text-muted-foreground">No engagement data yet.</p>}
              {themeRows.map((row, i) => (
                <div key={row.theme} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                    <span className="truncate">{themeLabel(row.theme)}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-medium">{row.avg}</span>
                    <span className="text-xs text-muted-foreground">({row.posts} posts)</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-4 lg:col-span-2">
            <h2 className="text-sm font-medium mb-3">Top posts ({rangeDays}d)</h2>
            <div className="space-y-2">
              {model.topPosts.length === 0 && <p className="text-sm text-muted-foreground">No posted content in range.</p>}
              {model.topPosts.map((p, i) => {
                const Icon = formatIcon[p.post_format || "text"] || Type;
                return (
                  <div key={p.id} className="flex items-center gap-3 text-sm border-b border-border/50 pb-2 last:border-0 last:pb-0">
                    <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{p.blog_title || "(untitled)"}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(p.publish_date + "T00:00:00"), "d MMM")} · {themeLabel(p.content_theme || "")}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {liInteractions(p) > 0 && <Badge variant="outline" style={{ borderColor: CHANNEL_COLOR.LinkedIn, color: CHANNEL_COLOR.LinkedIn }}>in {liInteractions(p)}</Badge>}
                      {fbInteractions(p) > 0 && <Badge variant="outline" style={{ borderColor: CHANNEL_COLOR.Facebook, color: CHANNEL_COLOR.Facebook }}>fb {fbInteractions(p)}</Badge>}
                      {igInteractions(p) > 0 && <Badge variant="outline" style={{ borderColor: CHANNEL_COLOR.Instagram, color: CHANNEL_COLOR.Instagram }}>ig {igInteractions(p)}</Badge>}
                      {ytInteractions(p) > 0 && <Badge variant="outline" style={{ borderColor: CHANNEL_COLOR.YouTube, color: CHANNEL_COLOR.YouTube }}>yt {ytInteractions(p)}</Badge>}
                      <span className="font-medium w-8 text-right">{p.interactions}</span>
                    </div>
                    {p.linkedin_url && (
                      <a href={p.linkedin_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Ask Arohan */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-medium">Ask Arohan — deep-dive on this data</h2>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {["Which format is earning the most engagement, and why?", "What should we post more of next week?", "Compare this week to last week across channels."].map((q) => (
              <Button key={q} variant="outline" size="sm" className="text-xs" onClick={() => askArohan(q)}>
                {q}
              </Button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (question.trim()) askArohan(question.trim());
            }}
          >
            <Input placeholder="Ask anything about your social performance…" value={question} onChange={(e) => setQuestion(e.target.value)} />
            <Button type="submit" size="icon" disabled={!question.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </Card>
      </div>
    </DashboardLayout>
  );
}
