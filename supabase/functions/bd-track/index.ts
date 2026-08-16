/**
 * bd-track — pull delivery outcomes back from globalcrm into bd_events, and
 * stop any sequence that has earned a stop.
 *
 * Separating delivered / opened / replied matters more than any split test:
 * most people conclude "the email didn't work" when it was never delivered.
 * The day-7 gate (bd-gate) reads exactly these three.
 *
 * Also captures the parent message's real RFC Message-ID once Resend has sent
 * it — a follow-up without it starts a NEW thread, which reads as automated
 * and undoes the email that worked.
 *
 *   POST {}
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { BD_ORG_ID } from '../_shared/bdPipeline.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const ok = (d: unknown) => new Response(JSON.stringify(d), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const err = (s: number, m: string) => new Response(JSON.stringify({ error: m }), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = getSupabaseClient();
  const gcUrl = Deno.env.get('GLOBALCRM_SUPABASE_URL');
  const gcKey = Deno.env.get('GLOBALCRM_SERVICE_KEY');
  if (!gcUrl || !gcKey) return err(500, 'GLOBALCRM_SUPABASE_URL / GLOBALCRM_SERVICE_KEY not configured');
  const gc = createClient(gcUrl, gcKey);
  const resendKey = Deno.env.get('RESEND_API_KEY');

  try {
    const { data: sequences } = await supabase
      .from('bd_sequences')
      .select('id, firm_id, contact_id, step, thread_message_id, stopped_at, bd_contacts(email)')
      .eq('org_id', BD_ORG_ID)
      .is('stopped_at', null);

    if (!sequences?.length) return ok({ skip: 'no live sequences' });

    let updated = 0, stopped = 0, threaded = 0;

    for (const seq of sequences) {
      const email = (seq as Record<string, any>).bd_contacts?.email;
      if (!email) continue;

      const { data: convs } = await gc
        .from('email_conversations')
        .select('id, status, sent_at, resend_id, opened_at, bounced_at, replied_at')
        .eq('to_email', email)
        .order('created_at', { ascending: true });

      if (!convs?.length) continue;

      for (const c of convs) {
        // Delivery states worth recording, in the order they can occur.
        const events: [string, string | null][] = [
          ['sent', c.sent_at], ['opened', c.opened_at],
          ['bounced', c.bounced_at], ['replied', c.replied_at],
        ];
        for (const [type, at] of events) {
          if (!at) continue;
          const { data: seen } = await supabase
            .from('bd_events').select('id')
            .eq('firm_id', seq.firm_id).eq('event_type', type)
            .eq('occurred_at', at).maybeSingle();
          if (seen) continue;
          await supabase.from('bd_events').insert({
            org_id: BD_ORG_ID, firm_id: seq.firm_id, sequence_id: seq.id,
            step: seq.step, event_type: type, occurred_at: at,
            detail: { conversation_id: c.id },
          });
          updated++;
        }

        // A reply or a bounce ends the sequence immediately. A follow-up sent
        // after a reply reads as automated and undoes the email that worked.
        const stopReason = c.replied_at ? 'replied' : c.bounced_at ? 'bounced' : null;
        if (stopReason && !seq.stopped_at) {
          await supabase.from('bd_sequences').update({
            stopped_at: new Date().toISOString(), stop_reason: stopReason, step: 'done',
            next_due_at: null, updated_at: new Date().toISOString(),
          }).eq('id', seq.id);
          await supabase.from('bd_firms').update({
            state_flag: 'CLOSED', state_reason: stopReason, updated_at: new Date().toISOString(),
          }).eq('id', seq.firm_id);
          stopped++;
          break;
        }

        // Capture the real Message-ID for threading. Resend returns it on the
        // sent message; without it a follow-up opens a new thread.
        if (!seq.thread_message_id && c.resend_id && resendKey) {
          try {
            const r = await fetch(`https://api.resend.com/emails/${c.resend_id}`, {
              headers: { Authorization: `Bearer ${resendKey}` },
              signal: AbortSignal.timeout(10_000),
            });
            if (r.ok) {
              const j = await r.json();
              if (j.message_id) {
                await supabase.from('bd_sequences').update({ thread_message_id: j.message_id }).eq('id', seq.id);
                threaded++;
              }
            }
          } catch { /* try again next sweep */ }
        }
      }
    }

    console.log(`[bd-track] events=${updated} stopped=${stopped} threaded=${threaded}`);
    return ok({ success: true, events_recorded: updated, sequences_stopped: stopped, threads_captured: threaded });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[bd-track] fatal:', msg);
    return err(500, msg);
  }
});
