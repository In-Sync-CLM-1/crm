import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import type { RecentLead } from "@/hooks/useDashboardOverview";

/**
 * The five most recent inbound leads. Outbound targets we created (BD Outreach),
 * bulk campaign imports, and the seeded demo records are all filtered out
 * upstream — this is people who approached us.
 */
export const NewLeadsPanel = memo(function NewLeadsPanel({
  data, isLoading,
}: { data?: RecentLead[]; isLoading?: boolean }) {
  if (isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-[140px] w-full mt-3" />
      </Card>
    );
  }

  const leads = data || [];
  const newest = leads[0];
  const staleDays = newest
    ? Math.floor((Date.now() - new Date(newest.created_at).getTime()) / 86400000)
    : null;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">New leads</h3>
          <p className="text-[11px] text-muted-foreground">Most recent enquiries, with where they came from</p>
        </div>
        {staleDays !== null && staleDays > 14 && (
          <span className="text-[10px] text-amber-600 dark:text-amber-400">
            none in {staleDays} days
          </span>
        )}
      </div>

      {leads.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">No inbound leads on record</div>
      ) : (
        <ul className="divide-y divide-border/60">
          {leads.map((l) => (
            <li key={l.id} className="py-2 flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-medium truncate">{l.name}</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {[l.company, l.product].filter(Boolean).join(" · ") || l.email || "—"}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] font-medium">{l.source}</div>
                <div className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
});
