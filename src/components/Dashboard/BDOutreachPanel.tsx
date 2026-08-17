import { memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { ExternalLink, Clock } from "lucide-react";
import { EChart } from "@/components/Marketing/EChart";
import { funnelChart, SLOT } from "@/components/Dashboard/chartStyle";
import type { DashboardOverview } from "@/hooks/useDashboardOverview";

/**
 * BD outreach — a funnel: firms sourced, graded, given a contact, researched,
 * drafted, then put into a sequence.
 *
 * Order matters and my first attempt got it wrong. Contact-finding (Apollo) and
 * research are independent steps, and contacts are ahead of research right now
 * (129 vs 16), so listing "Researched" above "Contactable" drew a funnel that
 * narrowed and then widened again — a shape that implies a subset relationship
 * the data does not have. Stages are ordered by how far the work has actually
 * got, which is also strictly decreasing.
 */
/** Next Tue/Wed/Thu — when approved drafts will actually leave. */
function nextSendDay(): string {
  const d = new Date();
  for (let i = 0; i < 8; i++) {
    const c = new Date(d.getTime() + i * 86400000);
    if ([2, 3, 4].includes(c.getDay())) {
      return i === 0 ? "today" : c.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
    }
  }
  return "the next send window";
}

export const BDOutreachPanel = memo(function BDOutreachPanel({
  data, isLoading,
}: { data?: DashboardOverview["bd"]; isLoading?: boolean }) {
  const option = useMemo(() => funnelChart([
    { name: "Sourced", value: data?.sourced ?? 0, color: SLOT.blue },
    { name: "Grade A/B", value: (data?.graded_a ?? 0) + (data?.graded_b ?? 0), color: SLOT.violet },
    { name: "Contactable", value: data?.contactable ?? 0, color: SLOT.yellow },
    { name: "Researched", value: data?.researched ?? 0, color: SLOT.aqua },
    { name: "Drafted", value: data?.drafted ?? 0, color: SLOT.orange },
    { name: "Approved", value: data?.approved ?? 0, color: SLOT.magenta },
    { name: "Sending", value: (data?.sequences_live ?? 0) + (data?.sequences_stopped ?? 0), color: SLOT.blue },
  ]), [data]);

  if (isLoading || !data) {
    return <Card className="p-4"><Skeleton className="h-4 w-32" /><Skeleton className="h-[170px] w-full mt-3" /></Card>;
  }

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold">BD outreach</h3>
          <p className="text-[11px] text-muted-foreground">US software boutiques, sourced to sequenced</p>
        </div>
        <Link to="/marketing/bd-outreach" className="text-[10px] text-primary inline-flex items-center gap-0.5 hover:underline">
          Review <ExternalLink className="h-2.5 w-2.5" />
        </Link>
      </div>

      <EChart option={option} height={162} />

      <div className="grid grid-cols-4 gap-1 border-t border-border pt-2 text-center">
        <div>
          <div className={`text-sm font-semibold ${(data.pending_review ?? 0) > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>
            {data.pending_review ?? 0}
          </div>
          <div className="text-[10px] text-muted-foreground">awaiting review</div>
        </div>
        <div>
          <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{data.approved ?? 0}</div>
          <div className="text-[10px] text-muted-foreground">approved</div>
        </div>
        <div>
          <div className="text-sm font-semibold">{data.sequences_live ?? 0}</div>
          <div className="text-[10px] text-muted-foreground">sending</div>
        </div>
        <div>
          <div className="text-sm font-semibold">{data.excluded ?? 0}</div>
          <div className="text-[10px] text-muted-foreground">opted out</div>
        </div>
      </div>

      {(data.approved ?? 0) > 0 && (data.sequences_live ?? 0) === 0 && (
        <p className="mt-1.5 text-[10px] text-muted-foreground flex items-start gap-1">
          <Clock className="h-3 w-3 mt-px shrink-0" />
          {data.approved} approved and waiting — the scheduler only sends Tue/Wed/Thu inside each
          firm's 8–11am local window, so these go out {nextSendDay()}.
        </p>
      )}
    </Card>
  );
});
