import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { LoadingState } from "@/components/common/LoadingState";
import { useNotification } from "@/hooks/useNotification";
import { useOrgContext } from "@/hooks/useOrgContext";
import { format } from "date-fns";
import {
  Search, Phone, Bot, RefreshCcw, Smile, Frown, Meh, Star,
  TrendingUp, AlertCircle, CheckCircle2, Clock, ListChecks,
} from "lucide-react";

type Sentiment = "positive" | "neutral" | "negative" | "mixed" | null;
type CallKind = "human" | "agentic";

interface CallRow {
  id: string;
  call_kind: CallKind;
  org_id: string;
  contact_id: string | null;
  agent_ref: string | null;
  from_number: string | null;
  to_number: string | null;
  direction: string;
  status: string;
  duration_sec: number | null;
  occurred_at: string;
  recording_url: string | null;
  transcript: string | null;
  transcript_provider: string | null;
  ai_summary: string | null;
  ai_analysis: any;
  quality_score: number | null;
  sentiment: Sentiment;
  analyzed_at: string | null;
  analysis_provider: string | null;
  analysis_error: string | null;
  provider_call_id: string | null;
  bolna_execution_id: string | null;
}

function formatDuration(sec: number | null): string {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function SentimentBadge({ value }: { value: Sentiment }) {
  if (!value) return <span className="text-muted-foreground text-xs">—</span>;
  const map: Record<string, { label: string; cls: string; Icon: any }> = {
    positive: { label: "Positive", cls: "bg-emerald-100 text-emerald-700 border-emerald-200", Icon: Smile },
    neutral: { label: "Neutral", cls: "bg-slate-100 text-slate-700 border-slate-200", Icon: Meh },
    negative: { label: "Negative", cls: "bg-rose-100 text-rose-700 border-rose-200", Icon: Frown },
    mixed: { label: "Mixed", cls: "bg-amber-100 text-amber-700 border-amber-200", Icon: Meh },
  };
  const m = map[value];
  return (
    <Badge variant="outline" className={`gap-1 ${m.cls}`}>
      <m.Icon className="h-3 w-3" /> {m.label}
    </Badge>
  );
}

function QualityStars({ score }: { score: number | null }) {
  if (!score) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i <= score ? "text-amber-400 fill-amber-400" : "text-slate-200"}`} />
      ))}
    </div>
  );
}

function KindBadge({ kind }: { kind: CallKind }) {
  return kind === "agentic" ? (
    <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 gap-1">
      <Bot className="h-3 w-3" /> Agentic
    </Badge>
  ) : (
    <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 gap-1">
      <Phone className="h-3 w-3" /> Human
    </Badge>
  );
}

function DetailDrawer({ row, onClose, onReanalyze, isReanalyzing }: {
  row: CallRow | null;
  onClose: () => void;
  onReanalyze: (row: CallRow) => void;
  isReanalyzing: boolean;
}) {
  if (!row) return null;
  const analysis = row.ai_analysis || {};
  return (
    <Sheet open={!!row} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <KindBadge kind={row.call_kind} />
            <div className="flex items-center gap-2">
              <QualityStars score={row.quality_score} />
              <SentimentBadge value={row.sentiment} />
            </div>
          </div>
          <SheetTitle className="text-lg">
            {row.from_number} → {row.to_number}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {format(new Date(row.occurred_at), "PPpp")} · {formatDuration(row.duration_sec)} · {row.status}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {row.recording_url ? (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Recording</p>
              <audio controls className="w-full" src={row.recording_url} />
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic">No audio recording (transcript only).</div>
          )}

          {row.ai_summary ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{row.ai_summary}</CardContent>
            </Card>
          ) : row.analysis_error ? (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <div>Analysis skipped: {row.analysis_error}</div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic">Not analyzed yet.</div>
          )}

          {analysis?.key_points?.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ListChecks className="h-4 w-4" /> Key points</CardTitle></CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1 list-disc pl-5">
                  {analysis.key_points.map((p: string, i: number) => <li key={i}>{p}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}

          {(analysis?.objections?.length > 0 || analysis?.customer_intent) && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Customer signal</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                {analysis.customer_intent && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Intent</p>
                    <p>{analysis.customer_intent}</p>
                  </div>
                )}
                {analysis.objections?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Objections</p>
                    <ul className="list-disc pl-5">
                      {analysis.objections.map((o: string, i: number) => <li key={i}>{o}</li>)}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {(analysis?.agent_strengths?.length > 0 || analysis?.agent_improvements?.length > 0) && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Agent performance</CardTitle></CardHeader>
              <CardContent className="text-sm grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold text-emerald-700 mb-1 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Strengths</p>
                  <ul className="list-disc pl-5">
                    {(analysis.agent_strengths || []).map((s: string, i: number) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold text-rose-700 mb-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Improvements</p>
                  <ul className="list-disc pl-5">
                    {(analysis.agent_improvements || []).map((s: string, i: number) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}

          {analysis?.follow_up_action && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Follow-up action</CardTitle></CardHeader>
              <CardContent className="text-sm">{analysis.follow_up_action}</CardContent>
            </Card>
          )}

          {row.transcript && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Transcript</CardTitle></CardHeader>
              <CardContent className="text-xs whitespace-pre-wrap font-mono leading-relaxed max-h-72 overflow-y-auto">
                {row.transcript}
              </CardContent>
            </Card>
          )}

          <div className="pt-2 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{row.transcript_provider || "—"} · {row.analysis_provider || "—"}</span>
            <Button size="sm" variant="outline" onClick={() => onReanalyze(row)} disabled={isReanalyzing}>
              {isReanalyzing ? "Re-analyzing…" : "Re-analyze"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function CallIntelligence() {
  const { effectiveOrgId } = useOrgContext();
  const notify = useNotification();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | CallKind>("all");
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");
  const [days, setDays] = useState("30");
  const [selected, setSelected] = useState<CallRow | null>(null);

  const { data: rows, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["call-intelligence", effectiveOrgId, days, kindFilter, sentimentFilter],
    queryFn: async () => {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - parseInt(days));
      let query = (supabase as any)
        .from("v_call_intelligence")
        .select("*")
        .eq("org_id", effectiveOrgId)
        .gte("occurred_at", fromDate.toISOString())
        .order("occurred_at", { ascending: false })
        .limit(500);
      if (kindFilter !== "all") query = query.eq("call_kind", kindFilter);
      if (sentimentFilter !== "all") query = query.eq("sentiment", sentimentFilter);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as CallRow[];
    },
    enabled: !!effectiveOrgId,
  });

  const refresh = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("transcribe-and-analyze-call", { body: { limit: 25 } });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      const n = data?.ok ?? 0;
      const sk = data?.skipped ?? 0;
      notify.success(`Analysis refreshed — ${n} new, ${sk} skipped`);
      qc.invalidateQueries({ queryKey: ["call-intelligence"] });
    },
    onError: (e: any) => notify.error(e?.message || "Refresh failed"),
  });

  const reanalyze = useMutation({
    mutationFn: async (row: CallRow) => {
      const table = row.call_kind === "agentic" ? "mkt_voice_calls" : "call_logs";
      const { data, error } = await supabase.functions.invoke("transcribe-and-analyze-call", {
        body: { table, call_id: row.id, call_kind: row.call_kind, force: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      notify.success("Re-analyzed");
      qc.invalidateQueries({ queryKey: ["call-intelligence"] });
      setSelected(null);
    },
    onError: (e: any) => notify.error(e?.message || "Re-analyze failed"),
  });

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.from_number, r.to_number, r.ai_summary, r.transcript]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q))
    );
  }, [rows, search]);

  const kpis = useMemo(() => {
    if (!rows) return { total: 0, agentic: 0, human: 0, analyzed: 0, avgScore: 0 };
    const scored = rows.filter((r) => r.quality_score);
    return {
      total: rows.length,
      agentic: rows.filter((r) => r.call_kind === "agentic").length,
      human: rows.filter((r) => r.call_kind === "human").length,
      analyzed: rows.filter((r) => r.analyzed_at).length,
      avgScore: scored.length ? Math.round((scored.reduce((s, r) => s + (r.quality_score || 0), 0) / scored.length) * 10) / 10 : 0,
    };
  }, [rows]);

  return (
    <DashboardLayout>
      <div className="space-y-4 p-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Call Intelligence</h1>
            <p className="text-sm text-muted-foreground">Recordings, transcripts and AI analysis for every call — agentic and human.</p>
          </div>
          <Button onClick={() => refresh.mutate()} disabled={refresh.isPending} variant="outline" className="gap-2">
            <RefreshCcw className={`h-4 w-4 ${refresh.isPending ? "animate-spin" : ""}`} />
            {refresh.isPending ? "Refreshing…" : "Refresh analysis"}
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <KpiCard label="Calls" value={kpis.total} />
          <KpiCard label="Agentic" value={kpis.agentic} />
          <KpiCard label="Human" value={kpis.human} />
          <KpiCard label="Analyzed" value={`${kpis.analyzed}/${kpis.total}`} />
          <KpiCard label="Avg quality" value={kpis.avgScore || "—"} />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base">Calls</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search number, summary or transcript"
                    className="pl-8 h-9 w-64"
                  />
                </div>
                <Select value={kindFilter} onValueChange={(v: any) => setKindFilter(v)}>
                  <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="agentic">Agentic</SelectItem>
                    <SelectItem value="human">Human</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
                  <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sentiments</SelectItem>
                    <SelectItem value="positive">Positive</SelectItem>
                    <SelectItem value="neutral">Neutral</SelectItem>
                    <SelectItem value="negative">Negative</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={days} onValueChange={setDays}>
                  <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Last 1 day</SelectItem>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading || isFetching ? <LoadingState message="Loading calls…" /> : null}
            {!isLoading && filtered.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">No calls in the selected window.</div>
            )}
            {filtered.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Sentiment</TableHead>
                    <TableHead>Quality</TableHead>
                    <TableHead>Summary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={`${r.call_kind}-${r.id}`} onClick={() => setSelected(r)} className="cursor-pointer">
                      <TableCell><KindBadge kind={r.call_kind} /></TableCell>
                      <TableCell className="text-xs">{format(new Date(r.occurred_at), "dd MMM HH:mm")}</TableCell>
                      <TableCell className="text-xs">{r.from_number || "—"}</TableCell>
                      <TableCell className="text-xs">{r.to_number || "—"}</TableCell>
                      <TableCell className="text-xs">{formatDuration(r.duration_sec)}</TableCell>
                      <TableCell><SentimentBadge value={r.sentiment} /></TableCell>
                      <TableCell><QualityStars score={r.quality_score} /></TableCell>
                      <TableCell className="text-xs max-w-md truncate">
                        {r.ai_summary || (r.analysis_error ? <span className="text-amber-600">{r.analysis_error}</span> : <span className="text-muted-foreground italic">Not analyzed</span>)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <DetailDrawer
        row={selected}
        onClose={() => setSelected(null)}
        onReanalyze={(r) => reanalyze.mutate(r)}
        isReanalyzing={reanalyze.isPending}
      />
    </DashboardLayout>
  );
}

function KpiCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold mt-0.5">{value}</div>
      </CardContent>
    </Card>
  );
}
