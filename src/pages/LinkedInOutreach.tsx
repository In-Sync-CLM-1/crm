import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/common/LoadingState";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Check, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";

/**
 * LinkedIn Connection Builder — the review queue.
 *
 * Mirrors BDOutreach.tsx's review-queue pattern: candidates found by
 * search.mjs (deterministic ICP match against the same industry->product
 * mapping proven on the 851-person reference list) sit here as `pending`
 * until Amit approves them. Nothing gets a connection request that hasn't
 * been approved here — connect.mjs only ever reads status='approved' rows,
 * and only within its own 9-10pm IST send window, capped at 5/day.
 */

interface Prospect {
  id: string;
  full_name: string;
  headline: string | null;
  current_company: string | null;
  linkedin_url: string;
  matched_product: string | null;
  reason: string | null;
  research_facts: Record<string, unknown> | null;
  status: string;
  created_at: string;
}

const STATUS_STYLE: Record<string, string> = {
  invited: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  accepted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  declined: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

export default function LinkedInOutreach() {
  const { effectiveOrgId } = useOrgContext();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"pending" | "invited" | "accepted">("pending");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: prospects, isLoading } = useQuery({
    queryKey: ["li-prospects", effectiveOrgId, tab],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("li_prospects")
        .select("id, full_name, headline, current_company, linkedin_url, matched_product, reason, research_facts, status, created_at")
        .eq("org_id", effectiveOrgId)
        .in("status", tab === "pending" ? ["pending"] : tab === "invited" ? ["invited"] : ["accepted", "declined"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Prospect[];
    },
    enabled: !!effectiveOrgId,
  });

  const { data: stats } = useQuery({
    queryKey: ["li-stats", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [pending, invited, accepted, known] = await Promise.all([
        sb.from("li_prospects").select("id", { count: "exact", head: true }).eq("org_id", effectiveOrgId).eq("status", "pending"),
        sb.from("li_prospects").select("id", { count: "exact", head: true }).eq("org_id", effectiveOrgId).eq("status", "invited"),
        sb.from("li_prospects").select("id", { count: "exact", head: true }).eq("org_id", effectiveOrgId).eq("status", "accepted"),
        sb.from("li_known_connections").select("id", { count: "exact", head: true }).eq("org_id", effectiveOrgId),
      ]);
      return {
        pending: pending.count ?? 0, invited: invited.count ?? 0,
        accepted: accepted.count ?? 0, known: known.count ?? 0,
      };
    },
    enabled: !!effectiveOrgId,
  });

  const visible = useMemo(() => prospects || [], [prospects]);

  const act = async (p: Prospect, status: "approved" | "rejected") => {
    setBusy(p.id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("li_prospects")
        .update({ status, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", p.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["li-prospects"] });
      await queryClient.invalidateQueries({ queryKey: ["li-stats"] });
      toast.success(status === "approved" ? "Approved — enters the next connect run (5/day, 9-10pm IST)." : "Rejected.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the prospect.");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <DashboardLayout><LoadingState /></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="p-4 lg:p-6 space-y-4 max-w-[1000px]">
        <div>
          <h1 className="text-xl font-semibold">LinkedIn Connection Builder</h1>
          <p className="text-sm text-muted-foreground">
            ICP-matched candidates wait here for approval. Nothing gets a connection request unreviewed — approved rows enter the next 5/day, 9-10pm IST batch.
          </p>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ["Awaiting your review", stats.pending],
              ["Invited, not yet accepted", stats.invited],
              ["Accepted", stats.accepted],
              ["Existing connections (excluded)", stats.known],
            ].map(([label, value]) => (
              <Card key={String(label)} className="p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold">{String(value)}</p>
              </Card>
            ))}
          </div>
        )}

        <div className="flex gap-1">
          {(["pending", "invited", "accepted"] as const).map((t) => (
            <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)}>
              {t === "pending" ? "Review queue" : t === "invited" ? "Invited" : "Accepted / declined"}
            </Button>
          ))}
        </div>

        {!visible.length && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Nothing here right now.
          </Card>
        )}

        {visible.map((p) => {
          const facts = (p.research_facts || {}) as Record<string, string>;
          return (
            <Card key={p.id} className="p-4 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium">{p.full_name}</h2>
                    {p.matched_product && <Badge variant="outline">{p.matched_product}</Badge>}
                    {p.status !== "pending" && (
                      <Badge className={STATUS_STYLE[p.status]}>{p.status}</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{p.headline}</p>
                  {p.current_company && <p className="text-xs text-muted-foreground">{p.current_company}</p>}
                </div>
                <a href={p.linkedin_url} target="_blank" rel="noreferrer" className="text-xs text-primary flex items-center gap-1 shrink-0">
                  View profile <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Why this connection</span>
                <p className="text-sm">{p.reason}</p>
                {facts.title_line && (
                  <p className="text-xs text-muted-foreground mt-0.5">Matched on: "{facts.title_line}"</p>
                )}
              </div>

              {p.status === "pending" && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" onClick={() => act(p, "approved")} disabled={busy === p.id}>
                    <Check className="h-3.5 w-3.5 mr-1.5" />Approve
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-600" onClick={() => act(p, "rejected")} disabled={busy === p.id}>
                    <X className="h-3.5 w-3.5 mr-1.5" />Reject
                  </Button>
                  <span className="text-xs text-muted-foreground self-center ml-auto">
                    found {format(new Date(p.created_at), "d MMM")}
                  </span>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </DashboardLayout>
  );
}
