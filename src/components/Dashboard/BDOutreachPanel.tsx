import { memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { EChart } from "@/components/Marketing/EChart";
import { funnelChart, SLOT } from "@/components/Dashboard/chartStyle";
import type { DashboardOverview } from "@/hooks/useDashboardOverview";

/**
 * BD outreach — a funnel, because that is literally what it is: firms sourced,
 * graded, researched, given a contact, drafted, then put into a live sequence.
 * Each stage is a strict subset of the one above it, so the narrowing is the
 * information.
 */
export const BDOutreachPanel = memo(function BDOutreachPanel({
  data, isLoading,
}: { data?: DashboardOverview["bd"]; isLoading?: boolean }) {
  const option = useMemo(() => funnelChart([
    { name: "Sourced", value: data?.sourced ?? 0, color: SLOT.blue },
    { name: "Grade A/B", value: (data?.graded_a ?? 0) + (data?.graded_b ?? 0), color: SLOT.violet },
    { name: "Researched", value: data?.researched ?? 0, color: SLOT.aqua },
    { name: "Contactable", value: data?.contactable ?? 0, color: SLOT.yellow },
    { name: "Drafted", value: data?.drafted ?? 0, color: SLOT.orange },
    { name: "Sequenced", value: (data?.sequences_live ?? 0) + (data?.sequences_stopped ?? 0), color: SLOT.magenta },
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

      <div className="grid grid-cols-3 gap-1 border-t border-border pt-2 text-center">
        <div>
          <div className={`text-sm font-semibold ${(data.pending_review ?? 0) > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>
            {data.pending_review ?? 0}
          </div>
          <div className="text-[10px] text-muted-foreground">awaiting review</div>
        </div>
        <div>
          <div className="text-sm font-semibold">{data.sequences_live ?? 0}</div>
          <div className="text-[10px] text-muted-foreground">sequences live</div>
        </div>
        <div>
          <div className="text-sm font-semibold">{data.excluded ?? 0}</div>
          <div className="text-[10px] text-muted-foreground">opted out</div>
        </div>
      </div>
    </Card>
  );
});
