import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import type { OrganicChannel } from "@/hooks/useDashboardOverview";

/**
 * Organic outcome per channel, last 30 days: what was published, who saw it,
 * who reacted, and where the follower count went. Posting volume alone says
 * nothing — a channel with 66 posts and no engagement is the finding.
 */
const LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  x: "X",
};

function Change({ value }: { value: number }) {
  if (!value) {
    return <span className="text-muted-foreground inline-flex items-center gap-0.5"><Minus className="h-3 w-3" />0</span>;
  }
  const up = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 ${up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {up ? "+" : ""}{value.toLocaleString("en-IN")}
    </span>
  );
}

export const OrganicChannelsPanel = memo(function OrganicChannelsPanel({
  data, isLoading,
}: { data?: OrganicChannel[]; isLoading?: boolean }) {
  if (isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-[160px] w-full mt-3" />
      </Card>
    );
  }

  const rows = (data || []).filter((c) => c.posts > 0 || c.followers > 0);

  return (
    <Card className="p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Organic campaigns</h3>
        <p className="text-[11px] text-muted-foreground">Per channel, last 30 days</p>
      </div>

      {rows.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">Nothing published in the last 30 days</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="text-left font-medium py-1.5">Channel</th>
                <th className="text-right font-medium">Posts</th>
                <th className="text-right font-medium">Reach</th>
                <th className="text-right font-medium">Engagement</th>
                <th className="text-right font-medium">Followers</th>
                <th className="text-right font-medium">30d</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.channel} className="border-b border-border/50 last:border-0">
                  <td className="py-2 font-medium">{LABEL[c.channel] || c.channel}</td>
                  <td className="text-right tabular-nums">{c.posts}</td>
                  <td className="text-right tabular-nums">{c.reach.toLocaleString("en-IN")}</td>
                  <td className="text-right tabular-nums">{c.engagement.toLocaleString("en-IN")}</td>
                  <td className="text-right tabular-nums">{c.followers.toLocaleString("en-IN")}</td>
                  <td className="text-right tabular-nums"><Change value={c.follower_change} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
});
