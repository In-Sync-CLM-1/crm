import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BOLNA = 'https://api.bolna.ai';
const GROQ_INSIGHTS_MODEL = 'llama-3.3-70b-versatile';

// Bolna call status enum → our mkt_voice_calls.status
// Final = terminal states that trigger insight extraction + next-call dispatch.
const TERMINAL_STATUSES = new Set([
  'completed', 'failed', 'no-answer', 'busy', 'canceled',
  'stopped', 'balance-low', 'error',
]);

// Privacy-first: raw transcript and recording URL are intentionally NOT persisted.
// Only Groq-extracted insights go into mkt_voice_calls.metadata.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const logger = createEngineLogger('mkt-bolna-webhook');

  try {
    const payload = await req.json().catch(() => ({} as Record<string, unknown>));
    const supabase = getSupabaseClient();

    const status = (payload.status as string) || 'unknown';
    const executionId = (payload.execution_id as string) || (payload.id as string) || null;
    const agentId = (payload.agent_id as string) || null;

    await logger.info('bolna-webhook-received', {
      status,
      execution_id: executionId,
      agent_id: agentId,
      duration: (payload.telephony_data as Record<string, unknown>)?.duration,
      hangup_reason: (payload.telephony_data as Record<string, unknown>)?.hangup_reason,
    });

    if (!executionId) {
      return ack({ received: true, warning: 'missing execution_id' });
    }

    const isTerminal = TERMINAL_STATUSES.has(status);

    if (!isTerminal) {
      // Non-final state (ringing/in-progress/etc) — leave row in 'in-flight'.
      // No-op other than the log above.
      return ack({ received: true, status, terminal: false });
    }

    // Look up the call row by bolna_execution_id.
    const { data: callRow, error: lookupErr } = await supabase
      .from('mkt_voice_calls')
      .select('id, batch_id, queue_position, status, org_id, contact_id')
      .eq('bolna_execution_id', executionId)
      .maybeSingle();

    if (lookupErr) {
      await logger.error('voice-call-lookup-failed', new Error(lookupErr.message), { executionId });
      return ack({ received: true, error: 'lookup_failed' });
    }

    if (!callRow) {
      // Webhook arrived for an execution we don't track (e.g., test harness call).
      await logger.warn('voice-call-not-found', { executionId, status });
      return ack({ received: true, warning: 'unknown_execution' });
    }

    // Extract insights from transcript (best-effort; never fails the webhook).
    const transcript = (payload.transcript as string) || '';
    const insights = transcript
      ? await extractInsights(transcript).catch((e) => {
          logger.warn('insight-extraction-failed', { executionId, error: String(e) });
          return null;
        })
      : null;

    const telephony = (payload.telephony_data as Record<string, unknown>) || {};
    const totalCost = (payload.total_cost as number) ?? null;
    const durationSec = telephony.duration != null ? Number(telephony.duration) : null;

    // Idempotent terminal transition: only update if currently in-flight.
    // If this is a duplicate webhook (already terminal), updatedRows will be empty
    // and we skip the next-call dispatch.
    const { data: updatedRows, error: updateErr } = await supabase
      .from('mkt_voice_calls')
      .update({
        status,
        ended_at: new Date().toISOString(),
        duration_sec: durationSec,
        hangup_reason: (telephony.hangup_reason as string) ?? null,
        total_cost: totalCost,
        metadata: insights ? { insights } : { insights: null },
        error_message: status === 'failed' || status === 'error'
          ? ((payload.error_message as string) ?? null)
          : null,
      })
      .eq('id', callRow.id)
      .eq('status', 'in-flight')
      .select('id');

    if (updateErr) {
      await logger.error('voice-call-update-failed', new Error(updateErr.message), { executionId });
      return ack({ received: true, error: 'update_failed' });
    }

    const transitioned = (updatedRows?.length ?? 0) > 0;
    if (!transitioned) {
      // Already in terminal state from a prior webhook — don't double-trigger next.
      await logger.info('voice-call-duplicate-terminal-webhook', { executionId, status });
      return ack({ received: true, status, terminal: true, duplicate: true });
    }

    // Sequential queue: dispatch the next queued call in the same batch.
    await dispatchNextInBatch(supabase, callRow.batch_id, logger);

    return ack({ received: true, status, terminal: true, duplicate: false });
  } catch (error) {
    await logger.error('bolna-webhook-failed', error);
    // Always 200 — Bolna will not retry meaningfully.
    return ack({ received: false, error: error instanceof Error ? error.message : 'unknown' });
  }
});

async function dispatchNextInBatch(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  batchId: string,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<void> {
  const { data: nextRow, error: queueErr } = await supabase
    .from('mkt_voice_calls')
    .select('id, contact_id, bolna_agent_id, from_phone_number, to_phone_number')
    .eq('batch_id', batchId)
    .eq('status', 'queued')
    .order('queue_position', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (queueErr) {
    await logger.error('queue-lookup-failed', new Error(queueErr.message), { batch_id: batchId });
    return;
  }

  if (!nextRow) {
    await logger.info('batch-completed', { batch_id: batchId });
    return;
  }

  // Pull contact details for user_data.
  const { data: contact, error: contactErr } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, company, job_title')
    .eq('id', nextRow.contact_id)
    .single();

  if (contactErr || !contact) {
    await logger.error('next-contact-load-failed', new Error(contactErr?.message ?? 'not_found'), {
      batch_id: batchId, voice_call_id: nextRow.id,
    });
    await supabase.from('mkt_voice_calls').update({
      status: 'error',
      error_message: 'Failed to load contact data',
    }).eq('id', nextRow.id);
    // Still try to advance past this row.
    await dispatchNextInBatch(supabase, batchId, logger);
    return;
  }

  const bolnaKey = Deno.env.get('BOLNA_API_KEY');
  if (!bolnaKey) {
    await logger.error('missing-bolna-key', new Error('BOLNA_API_KEY not set'), { batch_id: batchId });
    return;
  }

  const result = await triggerBolnaCall(
    bolnaKey,
    nextRow.bolna_agent_id,
    nextRow.to_phone_number,
    nextRow.from_phone_number,
    contact,
  );

  if (result.error) {
    await supabase.from('mkt_voice_calls').update({
      status: 'error',
      error_message: result.error,
    }).eq('id', nextRow.id);
    await logger.error('next-call-trigger-failed', new Error(result.error), {
      batch_id: batchId, voice_call_id: nextRow.id,
    });
    // Skip this and try the next one.
    await dispatchNextInBatch(supabase, batchId, logger);
    return;
  }

  await supabase.from('mkt_voice_calls').update({
    status: 'in-flight',
    bolna_execution_id: result.execution_id,
    initiated_at: new Date().toISOString(),
  }).eq('id', nextRow.id);

  await logger.info('next-call-dispatched', {
    batch_id: batchId,
    voice_call_id: nextRow.id,
    execution_id: result.execution_id,
  });
}

async function triggerBolnaCall(
  bolnaKey: string,
  agentId: string,
  toNumber: string,
  fromNumber: string,
  // deno-lint-ignore no-explicit-any
  contact: any,
): Promise<{ execution_id?: string; error?: string }> {
  const callBody = {
    agent_id: agentId,
    recipient_phone_number: toNumber,
    from_phone_number: fromNumber,
    user_data: {
      contact_id: contact.id,
      first_name: contact.first_name ?? '',
      last_name: contact.last_name ?? '',
      company: contact.company ?? 'your company',
      job_title: contact.job_title ?? '',
    },
  };

  const res = await fetch(`${BOLNA}/call`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bolnaKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(callBody),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { /* keep raw */ }
  if (!res.ok) return { error: `${res.status}: ${text}` };
  const execId = (json.execution_id as string) ?? (json.run_id as string);
  if (!execId) return { error: `No execution_id: ${text}` };
  return { execution_id: execId };
}

interface CallInsights {
  summary: string;
  key_facts: string[];
  objections: string[];
  interests: string[];
  next_steps: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
}

async function extractInsights(transcript: string): Promise<CallInsights | null> {
  const groqKey = Deno.env.get('GROQ_API_KEY');
  if (!groqKey) return null;

  const sysPrompt = [
    'You extract structured insights from sales-call transcripts.',
    'Return ONLY valid JSON matching this exact shape:',
    '{',
    '  "summary": "<one-sentence call summary>",',
    '  "key_facts": ["<fact about prospect or company>"],',
    '  "objections": ["<concern or pushback raised>"],',
    '  "interests": ["<thing they expressed interest in>"],',
    '  "next_steps": ["<concrete follow-up action discussed>"],',
    '  "sentiment": "positive" | "neutral" | "negative"',
    '}',
    'Use empty arrays if a category had nothing. Be terse.',
  ].join('\n');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_INSIGHTS_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: `Transcript:\n${transcript}` },
      ],
      temperature: 0.2,
      max_tokens: 600,
    }),
  });
  if (!res.ok) throw new Error(`Groq insight extraction failed: ${res.status} ${await res.text()}`);
  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? '';
  if (!content) return null;
  return JSON.parse(content) as CallInsights;
}

function ack(body: unknown): Response {
  // Always 200 to Bolna so it doesn't retry on our internal errors.
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
