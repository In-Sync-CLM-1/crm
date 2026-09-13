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
import { AlertTriangle, Check, ExternalLink, Paperclip, X } from "lucide-react";
import { toast } from "sonner";

/**
 * LinkedIn connection MESSAGING — the review queue for phase 2.
 *
 * Different audience from LinkedInOutreach.tsx (which is about NEW people to
 * connect with): this messages Amit's EXISTING 1st-degree connections, with
 * copy already written in Downloads\InSync_Lead_Recommendations_Enriched.xlsx
 * (PersonalizedMessage / FollowUp1_CaseStudy / FollowUp2_ProductWalkthrough)
 * — no LLM drafting here, this table IS the review queue for that existing
 * copy. send-message.mjs only ever sends an approved row, 5/day, 8-9pm IST.
 */

interface Message {
  id: string;
  full_name: string;
  linkedin_url: string;
  company: string | null;
  matched_product: string | null;
  step: string;
  message_text: string;
  attach_file: string | null;
  attach_url: string | null;
  status: string;
  created_at: string;
}

const STEP_LABEL: Record<string, string> = { initial: "Initial message", followup_1: "Follow-up 1 (case study)", followup_2: "Follow-up 2 (walkthrough)" };
const STEP_COLOR: Record<string, string> = {
  initial: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  followup_1: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  followup_2: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
};

export default function LinkedInMessages() {
  const { effectiveOrgId } = useOrgContext();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"pending" | "approved" | "sent">("pending");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: messages, isLoading } = useQuery({
    queryKey: ["li-messages", effectiveOrgId, tab],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("li_connection_messages")
        .select("id, full_name, linkedin_url, company, matched_product, step, message_text, attach_file, attach_url, status, created_at")
        .eq("org_id", effectiveOrgId)
        .eq("status", tab)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data as Message[];
    },
    enabled: !!effectiveOrgId,
  });

  const { data: stats } = useQuery({
    queryKey: ["li-message-stats", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [pending, approved, sent, missingAttach] = await Promise.all([
        sb.from("li_connection_messages").select("id", { count: "exact", head: true }).eq("org_id", effectiveOrgId).eq("status", "pending"),
        sb.from("li_connection_messages").select("id", { count: "exact", head: true }).eq("org_id", effectiveOrgId).eq("status", "approved"),
        sb.from("li_connection_messages").select("id", { count: "exact", head: true }).eq("org_id", effectiveOrgId).eq("status", "sent"),
        sb.from("li_connection_messages").select("id", { count: "exact", head: true }).eq("org_id", effectiveOrgId).not("attach_file", "is", null).is("attach_url", null),
      ]);
      return {
        pending: pending.count ?? 0, approved: approved.count ?? 0,
        sent: sent.count ?? 0, missingAttach: missingAttach.count ?? 0,
      };
    },
    enabled: !!effectiveOrgId,
  });

  const visible = useMemo(() => messages || [], [messages]);

  const act = async (m: Message, status: "approved" | "rejected") => {
    setBusy(m.id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("li_connection_messages")
        .update({ status, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", m.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["li-messages"] });
      await queryClient.invalidateQueries({ queryKey: ["li-message-stats"] });
      toast.success(status === "approved" ? "Approved — sends in the next 5/day, 8-9pm IST batch." : "Rejected.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the message.");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <DashboardLayout><LoadingState /></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="p-4 lg:p-6 space-y-4 max-w-[900px]">
        <div>
          <h1 className="text-xl font-semibold">LinkedIn Connection Messages</h1>
          <p className="text-sm text-muted-foreground">
            Pre-written copy from the enrichment file, one row per person per step. Nothing sends unreviewed — approved rows enter the next 5/day, 8-9pm IST batch.
          </p>
        </div>

        {stats && stats.missingAttach > 0 && (
          <Card className="p-3 border-orange-300 bg-orange-50 dark:bg-orange-950/30">
            <div className="flex items-center gap-1.5 text-sm text-orange-700 dark:text-orange-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {stats.missingAttach} follow-up{stats.missingAttach !== 1 ? "s" : ""} reference a case-study attachment that hasn't been uploaded yet — those steps won't send until the file is provided.
            </div>
          </Card>
        )}

        {stats && (
          <div className="grid grid-cols-3 gap-3">
            {[
              ["Awaiting your review", stats.pending],
              ["Approved, queued to send", stats.approved],
              ["Sent", stats.sent],
            ].map(([label, value]) => (
              <Card key={String(label)} className="p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold">{String(value)}</p>
              </Card>
            ))}
          </div>
        )}

        <div className="flex gap-1">
          {(["pending", "approved", "sent"] as const).map((t) => (
            <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)}>
              {t === "pending" ? "Review queue" : t === "approved" ? "Approved" : "Sent"}
            </Button>
          ))}
        </div>

        {!visible.length && (
          <Card className="p-8 text-center text-sm text-muted-foreground">Nothing here right now.</Card>
        )}

        {visible.map((m) => (
          <Card key={m.id} className="p-4 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-medium">{m.full_name}</h2>
                  <Badge className={STEP_COLOR[m.step]}>{STEP_LABEL[m.step] || m.step}</Badge>
                  {m.matched_product && <Badge variant="outline">{m.matched_product}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{m.company}</p>
              </div>
              <a href={m.linkedin_url} target="_blank" rel="noreferrer" className="text-xs text-primary flex items-center gap-1 shrink-0">
                View profile <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <p className="text-sm whitespace-pre-wrap bg-muted/50 rounded p-3">{m.message_text}</p>

            {m.attach_file && (
              <div className={`flex items-center gap-1.5 text-xs rounded px-2 py-1.5 ${m.attach_url ? "bg-muted/50 text-muted-foreground" : "bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400"}`}>
                <Paperclip className="h-3.5 w-3.5 shrink-0" />
                {m.attach_url ? (
                  <a href={m.attach_url} target="_blank" rel="noreferrer" className="underline">{m.attach_file}</a>
                ) : (
                  <span>{m.attach_file} — not yet uploaded, this step won't send until it is</span>
                )}
              </div>
            )}

            {m.status === "pending" && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" onClick={() => act(m, "approved")} disabled={busy === m.id}>
                  <Check className="h-3.5 w-3.5 mr-1.5" />Approve
                </Button>
                <Button size="sm" variant="outline" className="text-red-600" onClick={() => act(m, "rejected")} disabled={busy === m.id}>
                  <X className="h-3.5 w-3.5 mr-1.5" />Reject
                </Button>
                <span className="text-xs text-muted-foreground self-center ml-auto">
                  {format(new Date(m.created_at), "d MMM")}
                </span>
              </div>
            )}
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
}
