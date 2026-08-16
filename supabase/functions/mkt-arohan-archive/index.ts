/**
 * mkt-arohan-archive — nightly cron (cron-worker suffix "arohan-archive").
 *
 * Arohan chat rows live in mkt_arohan_conversations forever with no cleanup,
 * which would grow the live database table indefinitely. Each browser tab
 * gets a fresh thread_id on load (useArohanChat.ts), so a thread is a
 * naturally bounded conversation — once one has gone quiet for RETENTION_DAYS
 * it will never be appended to again, safe to move out.
 *
 * For each such thread: bundle its full message history into one JSON file,
 * upload to the crm-files R2 bucket (cheap, already-provisioned object
 * storage — see [[no-supabase-storage]]), then delete the rows from
 * Postgres. Nothing is lost, the live table just stops growing forever.
 */
import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { uploadToFilesR2 } from '../_shared/r2Files.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';

const RETENTION_DAYS = 30;
const MAX_THREADS_PER_RUN = 50; // keeps each invocation well inside the function timeout

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function err(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = getSupabaseClient();
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();

    // Grab old rows to find candidate thread ids, then confirm each one has
    // truly gone quiet (see the per-thread check below) before archiving it.
    const { data: candidates, error: candErr } = await supabase
      .from('mkt_arohan_conversations')
      .select('org_id, thread_id, created_at')
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(2000); // old rows only — plenty of headroom to find MAX_THREADS_PER_RUN distinct quiet threads

    if (candErr) return err(500, `candidate scan error: ${candErr.message}`);
    if (!candidates?.length) return ok({ archived: 0, note: 'nothing older than retention window' });

    const seen = new Map<string, string>(); // thread_id -> org_id
    for (const row of candidates) {
      if (!seen.has(row.thread_id)) seen.set(row.thread_id, row.org_id);
      if (seen.size >= MAX_THREADS_PER_RUN) break;
    }

    let archived = 0;
    let skippedStillActive = 0;
    const failures: string[] = [];

    for (const [threadId, orgId] of seen) {
      // Confirm the thread has truly gone quiet — its newest message (of any
      // age) must also be older than cutoff, else it's still live and would
      // lose in-progress context (e.g. an open persona-idea debate) if archived.
      const { data: newest, error: newestErr } = await supabase
        .from('mkt_arohan_conversations')
        .select('created_at')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (newestErr) { failures.push(`${threadId}: ${newestErr.message}`); continue; }
      if (!newest || newest.created_at >= cutoff) { skippedStillActive++; continue; }

      const { data: rows, error: rowsErr } = await supabase
        .from('mkt_arohan_conversations')
        .select('role, message, is_suggestion, suggestion_payload, created_at')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });
      if (rowsErr) { failures.push(`${threadId}: ${rowsErr.message}`); continue; }
      if (!rows?.length) continue;

      try {
        const payload = JSON.stringify({ org_id: orgId, thread_id: threadId, archived_at: new Date().toISOString(), messages: rows });
        await uploadToFilesR2(`arohan-archive/${orgId}/${threadId}.json`, new TextEncoder().encode(payload), 'application/json');

        const { error: delErr } = await supabase.from('mkt_arohan_conversations').delete().eq('thread_id', threadId);
        if (delErr) { failures.push(`${threadId}: archived but delete failed: ${delErr.message}`); continue; }

        archived++;
      } catch (e) {
        failures.push(`${threadId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    console.log(`[arohan-archive] archived ${archived} thread(s), ${skippedStillActive} still active, ${failures.length} failure(s)`);
    return ok({ archived, skipped_still_active: skippedStillActive, failures });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[arohan-archive] fatal:', msg);
    return err(500, msg);
  }
});
