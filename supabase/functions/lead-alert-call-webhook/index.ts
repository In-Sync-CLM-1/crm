// Receives Bolna execution updates for the new-lead owner-alert agent.
// Enforces: at most one call attempt in flight per lead, up to 3 attempts total,
// stop the instant one is answered. Bolna has no reliable native retry — this is it.
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BOLNA_AGENT = () => Deno.env.get('LEAD_ALERT_BOLNA_AGENT')!;
const BOLNA_FROM = '+911169323462';
const OPS_PHONE = '+917738919680';
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_SECONDS = 60;

// Statuses that mean the call actually connected to a person, however it ended.
const ATTENDED = new Set(['completed', 'call-disconnected']);
// Statuses that mean it never connected — eligible for a retry.
const UNATTENDED = new Set(['no-answer', 'busy', 'failed', 'canceled', 'error', 'stopped']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();
    const executionId: string | undefined = payload.id || payload.execution_id;
    const status: string | undefined = payload.status;

    if (!executionId || !status || (!ATTENDED.has(status) && !UNATTENDED.has(status))) {
      // Intermediate update (ringing/in-progress/etc) — nothing to decide yet.
      return new Response(JSON.stringify({ ok: true, ignored: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = getSupabaseClient();
    const { data: row } = await supabase
      .from('lead_alert_calls')
      .select('id, lead, attempt_number, status')
      .eq('bolna_execution_id', executionId)
      .maybeSingle();

    if (!row) {
      return new Response(JSON.stringify({ ok: true, unknown_execution: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (row.status !== 'placed') {
      // Already resolved (e.g. duplicate webhook delivery) — no-op.
      return new Response(JSON.stringify({ ok: true, already_resolved: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (ATTENDED.has(status)) {
      await supabase.from('lead_alert_calls').update({ status: 'attended', updated_at: new Date().toISOString() }).eq('id', row.id);
      return new Response(JSON.stringify({ ok: true, resolved: 'attended' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Unattended.
    if (row.attempt_number >= MAX_ATTEMPTS) {
      await supabase.from('lead_alert_calls').update({ status: 'exhausted', updated_at: new Date().toISOString() }).eq('id', row.id);
      console.log(`[lead-alert-call-webhook] gave up after ${row.attempt_number} attempts for lead:`, JSON.stringify(row.lead));
      return new Response(JSON.stringify({ ok: true, resolved: 'exhausted' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Retry: mark this attempt done, place the next one ~60s out so it never
    // overlaps the one that just ended.
    await supabase.from('lead_alert_calls').update({ status: 'unattended', updated_at: new Date().toISOString() }).eq('id', row.id);

    const lead = row.lead as { name?: string; company?: string; product?: string; phone?: string };
    const nextAttempt = row.attempt_number + 1;
    const scheduledAt = new Date(Date.now() + RETRY_DELAY_SECONDS * 1000).toISOString();

    const bolnaKey = Deno.env.get('BOLNA_API_KEY')!;
    const callRes = await fetch('https://api.bolna.ai/call', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bolnaKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: BOLNA_AGENT(),
        recipient_phone_number: OPS_PHONE,
        from_phone_number: BOLNA_FROM,
        scheduled_at: scheduledAt,
        user_data: {
          lead_name: lead.name || 'Unknown',
          company: lead.company || 'their company',
          product: lead.product || 'a product',
          phone: lead.phone || 'no phone on file',
        },
      }),
    });
    const callJson = await callRes.json().catch(() => ({}));

    await supabase.from('lead_alert_calls').insert({
      lead: row.lead,
      attempt_number: nextAttempt,
      bolna_execution_id: callJson.execution_id ?? null,
      status: 'placed',
    });

    console.log(`[lead-alert-call-webhook] attempt ${row.attempt_number} unattended (${status}), scheduled retry ${nextAttempt}/${MAX_ATTEMPTS} at ${scheduledAt}`);

    return new Response(JSON.stringify({ ok: true, resolved: 'retry_scheduled', attempt: nextAttempt }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[lead-alert-call-webhook] error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
