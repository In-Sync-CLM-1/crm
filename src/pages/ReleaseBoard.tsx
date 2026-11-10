import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/common/LoadingState";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useUrlState } from "@/hooks/useUrlState";
import { ExternalLink, RotateCw } from "lucide-react";

// Release board: every change across the In-Sync apps (from the central test ledger) and the owner's
// WorkSync tasks that the hourly worker handles. Platform admins only; data comes from the release-board function.

type Change = {
  repo: string; pr: number; app: string; title: string | null; status: string; went_live_at?: string | null; updated_at: string; url: string; task?: { number: string; title: string } | null;
  test: { result: string; summary: string; at: string } | null;
  deploy: { result: string; summary: string; at: string } | null;
  live: { result: string; summary: string; at: string } | null;
  waiver: { by: string | null; at: string } | null;
};
type Task = { id: string; number: string; title: string; org: string; status: string; due: string | null; state: string; worker_note: string | null; worker_at: string | null; pr_url: string | null };
type Board = { generated_at: string; changes: Change[]; tasks: Task[] };
// The WorkSync task a change was built for, shown next to the change.
const TaskId = ({ c }: { c: Change }) => (c.task ? <span title={c.task.title} className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums">{c.task.number}</span> : null);

// problem = something went wrong after or at going live; moving = still on its way (being tested, fixed or going live).
const STATUS: Record<string, { label: string; cls: string; problem?: boolean; moving?: boolean }> = {
  live: { label: "Live", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" },
  live_untested: { label: "Live, not tested", cls: "bg-teal-100 text-teal-900 dark:bg-teal-900/40 dark:text-teal-200" },
  live_problem: { label: "Live, check failed", cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200", problem: true },
  blocked: { label: "Blocked from going live", cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200", problem: true },
  failed: { label: "Tests failed, being fixed", cls: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200", moving: true },
  passed: { label: "Passed, going live", cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200", moving: true },
  waived: { label: "Testing waived", cls: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200" },
  testing: { label: "Testing", cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200", moving: true },
};
const TASK_STATE: Record<string, { label: string; cls: string }> = {
  needs_you: { label: "Needs you", cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" },
  waiting_approval: { label: "Waiting for your \"Approved\"", cls: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" },
  working: { label: "Worker on it", cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200" },
  queued: { label: "Next in line", cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
  done: { label: "Done", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" },
};
const ago = (d: string) => formatDistanceToNow(new Date(d), { addSuffix: true });
const Pill = ({ cls, children }: { cls: string; children: React.ReactNode }) => <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;

export default function ReleaseBoard() {
  const { isPlatformAdmin } = useOrgContext();
  const [app, setApp] = useUrlState("app", "all");
  const [show, setShow] = useUrlState("show", "all");
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["release-board"],
    enabled: isPlatformAdmin,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("release-board", { body: {} });
      if (error) throw error;
      if ((data as { error?: string }).error) throw new Error((data as { error: string }).error);
      return data as Board;
    },
  });

  const apps = useMemo(() => [...new Set((data?.changes ?? []).map((c) => c.app))].sort(), [data]);
  const changes = (data?.changes ?? []).filter((c) => (app === "all" || c.app === app) && (show === "all" || (show === "moving" ? STATUS[c.status]?.moving : show === "problem" ? STATUS[c.status]?.problem : c.status === show)));
  const needsYou = (data?.tasks ?? []).filter((t) => t.state === "needs_you");
  const approval = (data?.tasks ?? []).filter((t) => t.state === "waiting_approval");
  const working = (data?.tasks ?? []).filter((t) => t.state === "working" || t.state === "queued");
  const problems = (data?.changes ?? []).filter((c) => STATUS[c.status]?.problem);
  const moving = (data?.changes ?? []).filter((c) => STATUS[c.status]?.moving);
  // Every change that went live today (India time), tested by the test agent or not.
  const istDay = (d: string | number) => new Date(new Date(d).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const liveToday = (data?.changes ?? []).filter((c) => ["live", "live_untested", "live_problem"].includes(c.status) && c.went_live_at && istDay(c.went_live_at) === istDay(Date.now())).length;

  if (!isPlatformAdmin) {
    return <DashboardLayout><div className="p-6 text-sm text-muted-foreground">The release board is for platform administrators.</div></DashboardLayout>;
  }
  return (
    <DashboardLayout>
      <div className="p-4 lg:p-6 space-y-5 max-w-[1100px]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Release board</h1>
            <p className="text-sm text-muted-foreground">Every change on every app, from instruction to live. Tested changes go live by themselves.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}><RotateCw size={14} className={`mr-1.5 ${isFetching ? "animate-spin" : ""}`} />Refresh</Button>
        </div>

        {isLoading && <LoadingState message="Reading the test ledger…" />}
        {error && <Card className="p-4 text-sm text-red-700 dark:text-red-300">Could not load the board: {(error as Error).message}</Card>}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Needs you", needsYou.length, needsYou.length > 0],
                ["Waiting for \"Approved\"", approval.length, approval.length > 0],
                ["In progress", moving.length + working.length, false],
                ["Went live today", liveToday, false],
              ].map(([label, n, warn]) => (
                <Card key={String(label)} className={`p-3 ${warn ? "border-red-300 dark:border-red-800" : ""}`}>
                  <div className="text-2xl font-semibold tabular-nums">{n as number}</div>
                  <div className="text-xs text-muted-foreground">{label as string}</div>
                </Card>
              ))}
            </div>

            {needsYou.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">Needs you</h2>
                {needsYou.map((t) => (
                  <Card key={t.id} className="p-3 space-y-1">
                    <div className="flex flex-wrap items-center gap-2"><Pill cls={TASK_STATE.needs_you.cls}>Task</Pill><b className="text-sm">{t.number}</b><span className="text-xs text-muted-foreground">{t.org}</span></div>
                    <div className="text-sm break-words">{t.title}</div>
                    {t.worker_note && <p className="text-sm text-muted-foreground whitespace-pre-line">{t.worker_note}</p>}
                  </Card>
                ))}
              </section>
            )}

            {problems.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">Problems on live</h2>
                {problems.map((c) => (
                  <Card key={`${c.repo}#${c.pr}`} className="p-3 space-y-1">
                    <div className="flex flex-wrap items-center gap-2"><Pill cls={STATUS[c.status].cls}>{STATUS[c.status].label}</Pill><b className="text-sm">{c.app} #{c.pr}</b><TaskId c={c} /></div>
                    <div className="text-sm break-words">{c.title ?? ""}</div>
                    <p className="text-sm text-muted-foreground">{c.status === "live_problem" ? c.live?.summary : c.deploy?.summary}</p>
                  </Card>
                ))}
              </section>
            )}

            {moving.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">In progress</h2>
                <Card className="divide-y">
                  {moving.map((c) => (
                    <div key={`${c.repo}#${c.pr}`} className="p-2.5 space-y-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill cls={STATUS[c.status].cls}>{STATUS[c.status].label}</Pill>
                        <a href={c.url} target="_blank" rel="noreferrer" className="font-semibold text-primary inline-flex items-center gap-1">{c.app} #{c.pr} <ExternalLink size={12} /></a>
                        <TaskId c={c} />
                        <span className="text-xs text-muted-foreground tabular-nums">{ago(c.updated_at)}</span>
                      </div>
                      <div className="break-words">{c.title ?? ""}</div>
                      {c.test && <div className="text-xs text-muted-foreground">Last test: {c.test.summary}.</div>}
                    </div>
                  ))}
                </Card>
              </section>
            )}

            {(approval.length > 0 || working.length > 0) && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Your WorkSync tasks</h2>
                <Card className="divide-y">
                  {[...working, ...approval].map((t) => (
                    <div key={t.id} className="p-2.5 text-sm space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill cls={TASK_STATE[t.state].cls}>{TASK_STATE[t.state].label}</Pill>
                        <b>{t.number}</b>
                        <span className="text-xs text-muted-foreground">{t.org}</span>
                        {t.pr_url && <a href={t.pr_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1">Change <ExternalLink size={12} /></a>}
                      </div>
                      <div className="break-words">{t.title}</div>
                    </div>
                  ))}
                </Card>
                {approval.length > 0 && <p className="text-xs text-muted-foreground">Comment "Approved" on a task in WorkSync and the hourly worker picks it up.</p>}
              </section>
            )}

            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Changes</h2>
                <div className="flex flex-wrap gap-2">
                  <select id="rb-app" aria-label="App" value={app} onChange={(e) => setApp(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-sm">
                    <option value="all">All apps</option>{apps.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <select id="rb-show" aria-label="Status" value={show} onChange={(e) => setShow(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-sm">
                    <option value="all">Every status</option><option value="moving">In progress</option><option value="problem">Problems on live</option>
                    {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              {changes.length === 0 ? <Card className="p-4 text-sm text-muted-foreground">No changes match.</Card> : (
                <Card className="divide-y">
                  {changes.map((c) => (
                    <div key={`${c.repo}#${c.pr}`} className="p-2.5 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Pill cls={STATUS[c.status]?.cls ?? STATUS.testing.cls}>{STATUS[c.status]?.label ?? c.status}</Pill>
                        <b>{c.app} #{c.pr}</b><TaskId c={c} /><span className="min-w-0 basis-full sm:basis-auto sm:flex-1 break-words">{c.title ?? ""}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{ago(c.updated_at)}</span>
                        <a href={c.url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1">#{c.pr} <ExternalLink size={12} /></a>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.test && <>Tests: {c.test.summary}. </>}{c.waiver && <>Testing waived by {c.waiver.by ?? "unknown"}. </>}{c.live && <>Live site: {c.live.summary}.</>}
                      </div>
                    </div>
                  ))}
                </Card>
              )}
              <p className="text-xs text-muted-foreground">From the test ledger, updated {ago(data.generated_at)}. Every entry there is permanent and checked nightly.</p>
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
