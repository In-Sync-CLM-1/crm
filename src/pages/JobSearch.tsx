import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/common/LoadingState";
import { AlertTriangle, Check, ExternalLink, RotateCw, X } from "lucide-react";
import { toast } from "sonner";

/**
 * Job Search — the review queue for Amit's job-application matching engine.
 *
 * job-match-evaluate researches a JD and judges fit continuously; nothing
 * gets applied to unreviewed. High-match rows sit here, oldest first, until
 * Amit decides. Same discipline as BD Outreach: a draft/verdict you can't
 * see the reasoning behind is one you can't trust enough to act on.
 */

interface JobRow {
  id: string;
  platform: string;
  company: string | null;
  role_title: string;
  jd_url: string | null;
  jd_text: string;
  pay_range: string | null;
  posted_date: string | null;
  posted_by: string | null;
  work_arrangement: string | null;
  location_scope: string | null;
  company_profile_notes: string | null;
  hiring_trend_notes: string | null;
  verdict: "high_match" | "reject" | null;
  confidence: "high" | "medium" | "low" | null;
  match_reasoning: string | null;
  matched_requirements: string[] | null;
  missing_requirements: string[] | null;
  quoted_compensation: string | null;
  status: "evaluated" | "applied" | "skipped" | "error";
  error_detail: string | null;
  applied_by: string | null;
  applied_at: string | null;
  created_at: string;
}

type Tab = "pending" | "applied" | "rejected" | "errors";

export default function JobSearch() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("pending");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["job-applications", tab],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any).from("job_applications").select("*");
      if (tab === "pending") q = q.eq("status", "evaluated").eq("verdict", "high_match").order("created_at", { ascending: true });
      else if (tab === "applied") q = q.eq("status", "applied").order("applied_at", { ascending: false });
      else if (tab === "rejected") q = q.eq("status", "evaluated").eq("verdict", "reject").order("created_at", { ascending: false });
      else q = q.eq("status", "error").order("created_at", { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return data as JobRow[];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["job-applications-stats"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [evaluated, pending, applied, errored] = await Promise.all([
        sb.from("job_applications").select("id", { count: "exact", head: true }),
        sb.from("job_applications").select("id", { count: "exact", head: true }).eq("status", "evaluated").eq("verdict", "high_match"),
        sb.from("job_applications").select("id", { count: "exact", head: true }).eq("status", "applied"),
        sb.from("job_applications").select("id", { count: "exact", head: true }).eq("status", "error"),
      ]);
      return {
        evaluated: evaluated.count ?? 0, pending: pending.count ?? 0,
        applied: applied.count ?? 0, errored: errored.count ?? 0,
      };
    },
  });

  const visible = useMemo(() => rows || [], [rows]);

  const decide = async (row: JobRow, status: "applied" | "skipped") => {
    setBusy(row.id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("job_applications")
        .update({
          status,
          ...(status === "applied" ? { applied_by: "amit", applied_at: new Date().toISOString() } : {}),
        })
        .eq("id", row.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["job-applications"] });
      await queryClient.invalidateQueries({ queryKey: ["job-applications-stats"] });
      toast.success(status === "applied" ? "Marked applied." : "Skipped.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update this row.");
    } finally {
      setBusy(null);
    }
  };

  const retry = async (row: JobRow) => {
    setBusy(row.id);
    try {
      const { error } = await supabase.functions.invoke("job-match-evaluate", {
        body: {
          platform: row.platform, company: row.company, role_title: row.role_title,
          jd_text: row.jd_text, jd_url: row.jd_url, pay_range: row.pay_range,
          posted_date: row.posted_date, posted_by: row.posted_by,
        },
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["job-applications"] });
      await queryClient.invalidateQueries({ queryKey: ["job-applications-stats"] });
      toast.success("Re-evaluated.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry failed.");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <DashboardLayout><LoadingState /></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="p-4 lg:p-6 space-y-4 max-w-[1200px]">
        <div>
          <h1 className="text-xl font-semibold">Job Search</h1>
          <p className="text-sm text-muted-foreground">
            job-match-evaluate researches every JD before judging fit. Nothing gets applied to unreviewed.
          </p>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ["Evaluated", stats.evaluated],
              ["Awaiting your review", stats.pending],
              ["Applied", stats.applied],
              ["Errors", stats.errored],
            ].map(([label, value]) => (
              <Card key={String(label)} className="p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold">{String(value)}</p>
              </Card>
            ))}
          </div>
        )}

        <div className="flex gap-1">
          {(["pending", "applied", "rejected", "errors"] as const).map((t) => (
            <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)}>
              {t === "pending" ? "Review queue" : t === "applied" ? "Applied" : t === "rejected" ? "Rejected" : "Errors"}
            </Button>
          ))}
        </div>

        {visible.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">Nothing here right now.</Card>
        )}

        {visible.map((r) => (
          <Card key={r.id} className="p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-medium">{r.role_title}</h2>
                  <Badge variant="outline">{r.platform}</Badge>
                  {r.confidence && <Badge variant="outline">{r.confidence} confidence</Badge>}
                  {r.status === "applied" && <Badge className="bg-emerald-600">applied</Badge>}
                  {r.status === "skipped" && <Badge variant="secondary">skipped</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {[r.company, r.work_arrangement, r.location_scope].filter(Boolean).join(" · ")}
                  {r.posted_date && ` · posted ${format(new Date(r.posted_date), "d MMM")}`}
                </p>
              </div>
              {r.jd_url && (
                <a href={r.jd_url} target="_blank" rel="noreferrer" className="text-xs text-primary flex items-center gap-1">
                  <ExternalLink className="h-3.5 w-3.5" />JD
                </a>
              )}
            </div>

            {r.status === "error" ? (
              <div className="rounded border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm">
                <div className="flex items-center gap-1.5 font-medium text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4" /> Evaluation failed
                </div>
                <p className="mt-1 text-red-700 dark:text-red-300">{r.error_detail || "no detail captured"}</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <div className="space-y-1.5">
                  {r.match_reasoning && (
                    <div>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">Why this verdict</span>
                      <p>{r.match_reasoning}</p>
                    </div>
                  )}
                  {r.quoted_compensation && (
                    <div>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">Compensation to quote</span>
                      <p>{r.quoted_compensation}</p>
                    </div>
                  )}
                  {r.hiring_trend_notes && (
                    <div>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">Hiring trend</span>
                      <p className="text-xs">{r.hiring_trend_notes}</p>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  {!!r.matched_requirements?.length && (
                    <p className="text-xs"><span className="font-medium">Matched:</span> {r.matched_requirements.join(", ")}</p>
                  )}
                  {!!r.missing_requirements?.length && (
                    <p className="text-xs"><span className="font-medium">Missing:</span> {r.missing_requirements.join(", ")}</p>
                  )}
                  {r.company_profile_notes && (
                    <p className="text-xs text-muted-foreground line-clamp-4">{r.company_profile_notes}</p>
                  )}
                </div>
              </div>
            )}

            {tab === "pending" && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => decide(r, "applied")} disabled={busy === r.id}>
                  <Check className="h-3.5 w-3.5 mr-1.5" />Mark applied
                </Button>
                <Button size="sm" variant="outline" onClick={() => decide(r, "skipped")} disabled={busy === r.id}>
                  <X className="h-3.5 w-3.5 mr-1.5" />Skip
                </Button>
                <span className="text-xs text-muted-foreground self-center ml-auto">
                  evaluated {format(new Date(r.created_at), "d MMM")}
                </span>
              </div>
            )}

            {tab === "errors" && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => retry(r)} disabled={busy === r.id}>
                  <RotateCw className={`h-3.5 w-3.5 mr-1.5 ${busy === r.id ? "animate-spin" : ""}`} />Retry
                </Button>
                <span className="text-xs text-muted-foreground self-center ml-auto">
                  failed {format(new Date(r.created_at), "d MMM")}
                </span>
              </div>
            )}

            {r.applied_at && (
              <p className="text-xs text-muted-foreground">applied {format(new Date(r.applied_at), "d MMM, h:mm a")}</p>
            )}
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
}
