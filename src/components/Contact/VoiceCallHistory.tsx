import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Loader2, PhoneCall, Clock, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface VoiceCallRow {
  id: string;
  status: string;
  initiated_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
  hangup_reason: string | null;
  total_cost: number | null;
  metadata: { insights?: Insights | null } | null;
  from_phone_number: string | null;
  to_phone_number: string | null;
  bolna_execution_id: string | null;
  error_message: string | null;
  script: { name: string; objective: string } | null;
}

interface Insights {
  summary?: string;
  key_facts?: string[];
  objections?: string[];
  interests?: string[];
  next_steps?: string[];
  sentiment?: "positive" | "neutral" | "negative";
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  "in-flight": "secondary",
  queued: "outline",
  failed: "destructive",
  error: "destructive",
  "no-answer": "outline",
  busy: "outline",
  canceled: "outline",
};

export function VoiceCallHistory({ contactId }: { contactId: string }) {
  const [rows, setRows] = useState<VoiceCallRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("mkt_voice_calls")
        .select("id, status, initiated_at, ended_at, duration_sec, hangup_reason, total_cost, metadata, from_phone_number, to_phone_number, bolna_execution_id, error_message, script:mkt_call_scripts(name, objective)")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setRows([]);
      } else {
        setRows((data ?? []) as unknown as VoiceCallRow[]);
      }
    })();
    return () => { cancelled = true; };
  }, [contactId]);

  if (rows === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading call history...
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive py-4">Could not load call history: {error}</p>;
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <PhoneCall className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm">No AI calls to this contact yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const insights = row.metadata?.insights ?? null;
        const variant = STATUS_VARIANT[row.status] ?? "outline";
        const when = row.initiated_at ? format(new Date(row.initiated_at), "PPp") : "—";
        const dur = row.duration_sec != null ? `${Math.round(Number(row.duration_sec))}s` : null;

        return (
          <div key={row.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={variant} className="text-[10px]">{row.status}</Badge>
                  {row.script && <span className="text-xs font-medium">{row.script.name}</span>}
                  {insights?.sentiment && (
                    <Badge variant="outline" className="text-[10px]">{insights.sentiment}</Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{when}</p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                {dur && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{dur}</span>}
                {row.total_cost != null && (
                  <span className="flex items-center gap-1"><Wallet className="h-3 w-3" />{Number(row.total_cost).toFixed(2)}</span>
                )}
              </div>
            </div>

            {row.error_message && (
              <p className="text-xs text-destructive">{row.error_message}</p>
            )}

            {insights?.summary && (
              <p className="text-xs leading-relaxed">{insights.summary}</p>
            )}

            <div className="grid grid-cols-2 gap-3 text-[11px]">
              {insights?.key_facts && insights.key_facts.length > 0 && (
                <InsightList label="Key facts" items={insights.key_facts} />
              )}
              {insights?.objections && insights.objections.length > 0 && (
                <InsightList label="Objections" items={insights.objections} />
              )}
              {insights?.interests && insights.interests.length > 0 && (
                <InsightList label="Interests" items={insights.interests} />
              )}
              {insights?.next_steps && insights.next_steps.length > 0 && (
                <InsightList label="Next steps" items={insights.next_steps} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InsightList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="font-medium text-muted-foreground mb-1">{label}</p>
      <ul className="list-disc pl-4 space-y-0.5">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}
