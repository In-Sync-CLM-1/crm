import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { corsHeaders } from '../_shared/corsHeaders.ts';

/**
 * Release board: every change across all In-Sync apps, read from the central test ledger,
 * plus the owner's WorkSync tasks that the hourly worker is handling or that need the owner.
 * Platform admins only.
 *
 * Secrets: LEDGER_URL, LEDGER_READ_TOKEN (test ledger, read-only),
 *          WORKSYNC_URL, WORKSYNC_KEY, OWNER_WORKSYNC_ID (to read the owner's tasks and the worker's comments).
 */
const MARK = '🤖 Claude worker';
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

type Entry = { id: string; recorded_at: string; kind: string; repo: string; app: string | null; pr: number | null; sha: string | null; head_sha: string | null; actor: string | null; result: string; summary: string; title: string | null };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    // verify_jwt is off at the gateway (the publishable key trips it); the session is checked here.
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user || user.role !== 'authenticated') return json({ error: 'Unauthorized' }, 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: profile } = await admin.from('profiles').select('is_platform_admin').eq('id', user.id).maybeSingle();
    if (profile?.is_platform_admin !== true) return json({ error: 'Only platform administrators can see the release board.' }, 403);

    // 1. changes, from the test ledger
    const lr = await fetch(`${Deno.env.get('LEDGER_URL')}/entries?limit=1000`, { headers: { Authorization: `Bearer ${Deno.env.get('LEDGER_READ_TOKEN')}` } });
    if (!lr.ok) return json({ error: `The test ledger did not answer (${lr.status}).` }, 502);
    const entries = ((await lr.json()).entries ?? []) as Entry[];
    const byPr = new Map<string, Entry[]>();
    for (const e of entries) {
      if (e.pr == null) continue;
      const k = `${e.repo}#${e.pr}`;
      byPr.set(k, [...(byPr.get(k) ?? []), e]);
    }
    const latest = (list: Entry[], kind: string) => list.filter((e) => e.kind === kind).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0];
    const changes = [...byPr.entries()].map(([k, list]) => {
      const test = latest(list, 'test_run'), waiver = latest(list, 'waiver'), deploy = latest(list, 'deploy_decision'), live = latest(list, 'live_check');
      let status = 'testing';
      if (live && deploy?.result === 'allowed' && live.recorded_at > deploy.recorded_at) status = live.result === 'pass' ? 'live' : 'live_problem';
      else if (live && !deploy) status = live.result === 'pass' ? 'live' : 'live_problem';
      else if (deploy?.result === 'blocked') status = 'blocked';
      else if (deploy?.result === 'allowed') status = 'live';
      else if (waiver) status = 'waived';
      else if (test?.result === 'pass') status = 'passed';
      else if (test) status = 'failed';
      const last = list.reduce((a, b) => (a.recorded_at > b.recorded_at ? a : b));
      const [repo, pr] = k.split('#');
      return {
        repo, pr: Number(pr), app: list.find((e) => e.app)?.app ?? repo.split('/')[1], title: list.find((e) => e.title)?.title ?? null,
        status, updated_at: last.recorded_at, test: test ? { result: test.result, summary: test.summary, at: test.recorded_at } : null,
        deploy: deploy ? { result: deploy.result, summary: deploy.summary, at: deploy.recorded_at } : null,
        live: live ? { result: live.result, summary: live.summary, at: live.recorded_at } : null,
        waiver: waiver ? { by: waiver.actor, at: waiver.recorded_at } : null,
        url: `https://github.com/${repo}/pull/${pr}`,
      };
    }).sort((a, b) => b.updated_at.localeCompare(a.updated_at));

    // 2. the owner's WorkSync tasks: what the worker is doing, and what needs the owner
    const WS = Deno.env.get('WORKSYNC_URL'), WK = Deno.env.get('WORKSYNC_KEY'), OWNER = Deno.env.get('OWNER_WORKSYNC_ID');
    const tasks: unknown[] = [];
    if (WS && WK && OWNER) {
      const H = { apikey: WK, Authorization: `Bearer ${WK}` };
      const open = await (await fetch(`${WS}/rest/v1/tasks?select=id,task_number,task_name,status,assigned_by,created_at,due_date,org_id&assigned_to=eq.${OWNER}&status=in.(pending,in_progress)&order=created_at.desc&limit=200`, { headers: H })).json() as { id: string; task_number: string; task_name: string; status: string; assigned_by: string; created_at: string; due_date: string | null; org_id: string }[];
      const orgs = Object.fromEntries((await (await fetch(`${WS}/rest/v1/organizations?select=id,name`, { headers: H })).json() as { id: string; name: string }[]).map((o) => [o.id, o.name]));
      const ids = open.map((t) => t.id);
      const comments = ids.length ? await (await fetch(`${WS}/rest/v1/task_comments?select=task_id,user_id,comment,comment_type,created_at&task_id=in.(${ids.join(',')})&order=created_at.asc`, { headers: H })).json() as { task_id: string; user_id: string; comment: string; comment_type: string; created_at: string }[] : [];
      for (const t of open) {
        const cs = comments.filter((c) => c.task_id === t.id);
        const approved = t.assigned_by === OWNER || cs.some((c) => c.user_id === OWNER && c.comment_type !== 'system' && /\bapproved\b/i.test(c.comment) && !/\b(not|un|dis)\s*approved\b/i.test(c.comment));
        const worker = cs.filter((c) => c.comment.startsWith(MARK)).pop();
        const tag = worker?.comment.match(/\[(picked|question|needs-you|pr #\d+|failed|done)\]/)?.[1] ?? null;
        const answered = worker && cs.some((c) => c.created_at > worker.created_at && !c.comment.startsWith(MARK) && c.comment_type !== 'system');
        let state = 'waiting_approval';
        if (approved) state = !tag ? 'queued' : ['question', 'needs-you', 'failed'].includes(tag) ? (answered ? 'queued' : 'needs_you') : tag === 'done' ? 'done' : 'working';
        tasks.push({
          id: t.id, number: t.task_number, title: t.task_name, org: orgs[t.org_id] ?? '', status: t.status, due: t.due_date, state,
          worker_note: worker ? worker.comment.replace(MARK, '').replace(/^\s*\[[^\]]+\]:\s*/, '').trim() : null, worker_at: worker?.created_at ?? null,
          pr_url: worker?.comment.match(/https:\/\/github\.com\/\S+\/pull\/\d+/)?.[0] ?? null,
        });
      }
    }
    return json({ generated_at: new Date().toISOString(), changes, tasks });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
