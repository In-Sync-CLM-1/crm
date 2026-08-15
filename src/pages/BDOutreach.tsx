import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/common/LoadingState";
import { useOrgContext } from "@/hooks/useOrgContext";
import { AlertTriangle, Check, Clock, RefreshCw, RotateCw, X } from "lucide-react";
import { toast } from "sonner";

/**
 * BD Outreach — the review queue.
 *
 * The pipeline generates continuously and never stalls waiting for a human;
 * drafts sit here with their reasoning visible until Amit reads them. Nothing
 * sends unreviewed, and a missed review day delays a send rather than breaking
 * the sequence.
 *
 * Every card shows its working — why this firm, why this contact, why this
 * angle, why this proof — because a draft you cannot audit is a draft you
 * cannot trust enough to approve in one pass.
 */

interface Draft {
  id: string;
  firm_id: string;
  contact_id: string | null;
  angle_version: number | null;
  proof_key: string | null;
  subject: string | null;
  first_line: string | null;
  body: string | null;
  reasoning: Record<string, unknown> | null;
  status: string;
  created_at: string;
  bd_firms: {
    firm_name: string; city: string | null; state: string | null; grade: string | null;
    fit_score: number | null; headcount_band: string | null; bill_rate_band: string | null;
    time_zone: string | null; research_facts: Record<string, string[]> | null;
    disqualifier_flags: Record<string, string[]> | null;
  } | null;
  bd_contacts: { first_name: string | null; last_name: string | null; title: string | null; email: string | null } | null;
}

const ANGLE_LABEL: Record<number, string> = {
  1: "v1 · CRM/ERP line",
  2: "v2 · staff-aug",
  3: "v3 · AI gap",
  4: "v4 · domain anchor",
};

export default function BDOutreach() {
  const { effectiveOrgId } = useOrgContext();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"pending" | "scheduled" | "flagged">("pending");
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const { data: drafts, isLoading } = useQuery({
    queryKey: ["bd-drafts", effectiveOrgId, tab],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("bd_drafts")
        .select("id, firm_id, contact_id, angle_version, proof_key, subject, first_line, body, reasoning, status, created_at, bd_firms(firm_name, city, state, grade, fit_score, headcount_band, bill_rate_band, time_zone, research_facts, disqualifier_flags), bd_contacts(first_name, last_name, title, email)")
        .eq("org_id", effectiveOrgId)
        .in("status", tab === "scheduled" ? ["scheduled", "sent"] : ["pending", "approved"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Draft[];
    },
    enabled: !!effectiveOrgId,
  });

  const { data: stats } = useQuery({
    queryKey: ["bd-stats", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [firms, sent, replied, needContact] = await Promise.all([
        sb.from("bd_firms").select("grade", { count: "exact", head: true }).eq("org_id", effectiveOrgId).in("grade", ["A", "B"]).is("state_flag", null),
        sb.from("bd_firms").select("id", { count: "exact", head: true }).eq("org_id", effectiveOrgId).eq("state_flag", "SENT"),
        sb.from("bd_events").select("firm_id", { count: "exact", head: true }).eq("org_id", effectiveOrgId).eq("event_type", "replied"),
        sb.from("bd_firms").select("id", { count: "exact", head: true }).eq("org_id", effectiveOrgId).is("researched_at", null).in("grade", ["A", "B"]).is("state_flag", null),
      ]);
      return {
        pool: firms.count ?? 0, sent: sent.count ?? 0,
        replied: replied.count ?? 0, unresearched: needContact.count ?? 0,
      };
    },
    enabled: !!effectiveOrgId,
  });

  const visible = useMemo(() => {
    const all = drafts || [];
    if (tab === "flagged") return all.filter((d) => d.bd_firms?.disqualifier_flags);
    return all;
  }, [drafts, tab]);

  const act = async (draft: Draft, status: "approved" | "rejected" | "deferred") => {
    setBusy(draft.id);
    try {
      const edit = edits[draft.id];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("bd_drafts")
        .update({
          status,
          ...(edit ? { subject: edit.subject, body: edit.body } : {}),
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", draft.id);
      if (error) throw error;

      // Rejecting the draft parks the firm too — otherwise the next generation
      // run drafts it again tomorrow.
      if (status === "rejected") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("bd_firms")
          .update({ state_flag: "PARKED", state_reason: "draft rejected at review", updated_at: new Date().toISOString() })
          .eq("id", draft.firm_id);
      }
      await queryClient.invalidateQueries({ queryKey: ["bd-drafts"] });
      toast.success(status === "approved" ? "Approved — enters the send schedule." : status === "rejected" ? "Rejected and firm parked." : "Deferred.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the draft.");
    } finally {
      setBusy(null);
    }
  };

  const runStep = async (fn: string, label: string, body: Record<string, unknown> = {}) => {
    setBusy(fn);
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["bd-drafts"] });
      await queryClient.invalidateQueries({ queryKey: ["bd-stats"] });
      toast.success(`${label}: ${JSON.stringify(data).slice(0, 120)}`);
    } catch (e) {
      toast.error(`${label} failed — ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <DashboardLayout><LoadingState /></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="p-4 lg:p-6 space-y-4 max-w-[1200px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">BD Outreach</h1>
            <p className="text-sm text-muted-foreground">
              Prosync — US boutique delivery capacity. Drafts wait here; nothing sends unreviewed.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => runStep("bd-research", "Research", { limit: 10 })} disabled={!!busy}>
              <RotateCw className={`h-3.5 w-3.5 mr-1.5 ${busy === "bd-research" ? "animate-spin" : ""}`} />Research
            </Button>
            <Button size="sm" variant="outline" onClick={() => runStep("bd-contacts", "Contacts", { limit: 10 })} disabled={!!busy}>
              Contacts
            </Button>
            <Button size="sm" variant="outline" onClick={() => runStep("bd-draft", "Draft", { limit: 5 })} disabled={!!busy}>
              Draft 5
            </Button>
            <Button size="sm" variant="outline" onClick={() => runStep("bd-schedule", "Schedule")} disabled={!!busy}>
              Schedule
            </Button>
            <Button size="sm" variant="outline" onClick={() => runStep("bd-track", "Track")} disabled={!!busy}>
              <RefreshCw className={`h-3.5 w-3.5 ${busy === "bd-track" ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ["Pool (A+B, untouched)", stats.pool],
              ["In a sequence", stats.sent],
              ["Replies", stats.replied],
              ["Awaiting research", stats.unresearched],
            ].map(([label, value]) => (
              <Card key={String(label)} className="p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold">{String(value)}</p>
              </Card>
            ))}
          </div>
        )}

        <div className="flex gap-1">
          {(["pending", "scheduled", "flagged"] as const).map((t) => (
            <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)}>
              {t === "pending" ? "Review queue" : t === "scheduled" ? "Scheduled" : "Flagged"}
            </Button>
          ))}
        </div>

        {!visible.length && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Nothing here. If the queue is empty on a send day, nothing goes out — an unreviewed email is worse than a skipped day.
          </Card>
        )}

        {visible.map((d) => {
          const f = d.bd_firms;
          const c = d.bd_contacts;
          const r = (d.reasoning || {}) as Record<string, string>;
          const facts = f?.research_facts || {};
          const flags = f?.disqualifier_flags;
          const edit = edits[d.id] || { subject: d.subject || "", body: d.body || "" };

          return (
            <Card key={d.id} className="p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium">{f?.firm_name}</h2>
                    <Badge variant="outline">{f?.grade}</Badge>
                    {d.status === "approved" && <Badge className="bg-emerald-600">approved</Badge>}
                    {d.status === "scheduled" && <Badge variant="secondary">scheduled</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {[f?.city, f?.state, f?.time_zone, f?.headcount_band, f?.bill_rate_band].filter(Boolean).join(" · ")}
                    {f?.fit_score != null && ` · fit ${Math.round(f.fit_score <= 1 ? f.fit_score * 100 : f.fit_score)}%`}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>{c?.first_name} {c?.last_name}</div>
                  <div>{c?.title}</div>
                  <div>{c?.email}</div>
                </div>
              </div>

              {flags && (
                <div className="rounded border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm">
                  <div className="flex items-center gap-1.5 font-medium text-red-700 dark:text-red-400">
                    <AlertTriangle className="h-4 w-4" /> Disqualifier flags — read before approving
                  </div>
                  <ul className="mt-1 space-y-0.5 text-red-700 dark:text-red-300">
                    {Object.entries(flags).map(([k, v]) => (
                      <li key={k}><span className="font-medium">{k.replace(/_/g, " ")}:</span> {(v as string[]).join(" · ")}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <div className="space-y-1.5">
                  {[
                    ["Why this firm", r.why_firm],
                    ["Why this contact", r.why_contact],
                    ["Why this angle", `${ANGLE_LABEL[d.angle_version || 0] || ""} — ${r.why_angle || ""}`],
                    ["Why this proof", r.why_proof],
                    ["Fallback contact", r.fallback_contact],
                  ].map(([label, value]) => value ? (
                    <div key={String(label)}>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
                      <p>{String(value)}</p>
                    </div>
                  ) : null)}
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">Research facts (verbatim)</span>
                  {(["clients", "cases", "stack", "verticals", "team"] as const).map((k) => (
                    facts[k]?.length ? (
                      <p key={k} className="text-xs">
                        <span className="font-medium">{k}:</span> {facts[k].slice(0, 8).join(", ")}
                      </p>
                    ) : null
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Input
                  value={edit.subject}
                  onChange={(e) => setEdits({ ...edits, [d.id]: { ...edit, subject: e.target.value } })}
                  className="font-medium"
                  disabled={d.status !== "pending"}
                />
                <Textarea
                  value={edit.body}
                  onChange={(e) => setEdits({ ...edits, [d.id]: { ...edit, body: e.target.value } })}
                  rows={16}
                  className="font-mono text-xs"
                  disabled={d.status !== "pending"}
                />
              </div>

              {d.status === "pending" && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => act(d, "approved")} disabled={busy === d.id}>
                    <Check className="h-3.5 w-3.5 mr-1.5" />Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => act(d, "deferred")} disabled={busy === d.id}>
                    <Clock className="h-3.5 w-3.5 mr-1.5" />Defer
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-600" onClick={() => act(d, "rejected")} disabled={busy === d.id}>
                    <X className="h-3.5 w-3.5 mr-1.5" />Reject firm
                  </Button>
                  <span className="text-xs text-muted-foreground self-center ml-auto">
                    drafted {format(new Date(d.created_at), "d MMM")}
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
