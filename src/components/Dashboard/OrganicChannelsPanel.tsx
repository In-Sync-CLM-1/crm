import { memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { EChart } from "@/components/Marketing/EChart";
import { barChart, CHANNEL_COLOR, SLOT } from "@/components/Dashboard/chartStyle";
import type { OrganicChannel } from "@/hooks/useDashboardOverview";

/**
 * Organic outcome per channel. Horizontal bars, because the comparison is
 * between five named channels rather than across time — and reach and
 * engagement differ by orders of magnitude, so engagement gets its own row of
 * numbers rather than a second bar nobody could see.
 */
const LABEL: Record<string, string> = {
  linkedin: "LinkedIn", facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", x: "X",
};

export const OrganicChannelsPanel = memo(function OrganicChannelsPanel({
  data, isLoading,
}: { data?: OrganicChannel[]; isLoading?: boolean }) {
  const rows = (data || []).filter((c) => c.posts > 0 || c.followers > 0);
  const ranked = [...rows].sort((a, b) => a.reach - b.reach);

  const option = useMemo(() => barChart(
    ranked.map((c) => LABEL[c.channel] || c.channel),
    [{ name: "Reach", data: ranked.map((c) => c.reach), color: SLOT.blue }],
    { horizontal: true, minInterval: 1 },
  ), [ranked]);

  // Colour each bar by its channel so identity survives across panels.
  const coloured = useMemo(() => {
    const o = JSON.parse(JSON.stringify(option));
    o.series[0].data = ranked.map((c) => ({
      value: c.reach,
      itemStyle: { color: CHANNEL_COLOR[c.channel] || SLOT.blue, borderRadius: [0, 4, 4, 0] },
    }));
    return o;
  }, [option, ranked]);

  if (isLoading) {
    return <Card className="p-4"><Skeleton className="h-4 w-40" /><Skeleton className="h-[150px] w-full mt-3" /></Card>;
  }

  const totalPosts = rows.reduce((s, c) => s + c.posts, 0);

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold">Organic campaigns</h3>
          <p className="text-[11px] text-muted-foreground">Reach per channel, last 30 days</p>
        </div>
        <div className="text-right">
          <div className="text-base font-semibold leading-none">{totalPosts}</div>
          <div className="text-[10px] text-muted-foreground">posts published</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="py-10 text-center text-xs text-muted-foreground">Nothing published in the last 30 days</div>
      ) : (
        <>
          <EChart option={coloured} height={140} />
          <div className="mt-2 grid grid-cols-5 gap-1 border-t border-border pt-2">
            {rows.map((c) => (
              <div key={c.channel} className="text-center">
                <div className="text-[10px] text-muted-foreground truncate">{LABEL[c.channel] || c.channel}</div>
                <div className="text-xs font-medium tabular-nums">{c.engagement}</div>
                <div className="text-[9px] text-muted-foreground">engaged</div>
                <div className={`text-[9px] inline-flex items-center gap-0.5 ${
                  c.follower_change > 0 ? "text-emerald-600 dark:text-emerald-400"
                  : c.follower_change < 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>
                  {c.follower_change > 0 ? <ArrowUpRight className="h-2.5 w-2.5" />
                    : c.follower_change < 0 ? <ArrowDownRight className="h-2.5 w-2.5" /> : null}
                  {c.follower_change > 0 ? "+" : ""}{c.follower_change}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
});
