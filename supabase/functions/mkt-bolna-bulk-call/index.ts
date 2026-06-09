import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BOLNA = 'https://api.bolna.ai';
// User's Exotel landline (account: ecrtechnicalinnovations1m). Empirically required
// as `from_phone_number` on POST /call — without it Bolna falls back to its hosted
// number which Exotel rejects with "Could not find the CallerId from which this call
// can be made". See project_bolna_migration memory for the diagnosis history.
const DEFAULT_FROM = '+911169323462';
const DEFAULT_VOICE_ID = 'zFLlkq72ysbq1TWC0Mlx'; // ElevenLabs Anushri — Natural Young Indian Voice (female)
const DEFAULT_VOICE_NAME = 'Anushri';

interface BulkCallRequest {
  contact_ids: string[];
  script_id: string;
  from?: string;
}

interface ScriptRow {
  id: string;
  org_id: string;
  name: string;
  objective: string;
  opening: string;
  key_points: unknown;
  objection_handling: unknown;
  closing: string | null;
  voice_id: string | null;
  language: string | null;
  max_duration_seconds: number | null;
  bolna_agent_id: string | null;
  product_key: string | null;
}

interface ProductRow {
  product_key: string;
  product_name: string | null;
  product_notes: string | null;
  trial_days: number | null;
}

interface ContactRow {
  id: string;
  org_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const logger = createEngineLogger('mkt-bolna-bulk-call');

  try {
    const body: BulkCallRequest & { action?: string } = await req.json();

    // Utility branch: fetch the current Bolna account info (incl. account ID)
    if (body.action === 'user_me') {
      const bolnaKey = required('BOLNA_API_KEY');
      const res = await fetch(`${BOLNA}/user/me`, {
        headers: { Authorization: `Bearer ${bolnaKey}` },
      });
      const text = await res.text();
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
      return done(res.status, parsed);
    }

    // Utility branch: fetch a single execution from Bolna
    if (body.action === 'get_execution') {
      const bolnaKey = required('BOLNA_API_KEY');
      const { execution_id } = body as unknown as { execution_id: string };
      const res = await fetch(`${BOLNA}/executions/${execution_id}`, {
        headers: { Authorization: `Bearer ${bolnaKey}` },
      });
      const text = await res.text();
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
      return done(res.status, parsed);
    }

    // Utility branch: list Bolna's available voices
    if (body.action === 'list_voices') {
      const bolnaKey = required('BOLNA_API_KEY');
      const res = await fetch(`${BOLNA}/me/voices`, {
        headers: { Authorization: `Bearer ${bolnaKey}` },
      });
      const text = await res.text();
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
      return done(res.status, parsed);
    }

    // Utility branch: upload a credential to Bolna's provider store (replace if exists)
    if (body.action === 'upload_provider') {
      const bolnaKey = required('BOLNA_API_KEY');
      const { name, value } = body as unknown as { name: string; value: string };
      if (!name || !value) throw new Error('name and value are required for upload_provider');

      // Bolna expects provider_name / provider_value (not name / value).
      const providerBody = { provider_name: name, provider_value: value };
      let res = await fetch(`${BOLNA}/providers`, {
        method: 'POST',
        headers: bolnaHeaders(bolnaKey),
        body: JSON.stringify(providerBody),
      });
      if (res.status === 409) {
        await fetch(`${BOLNA}/providers/${name}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${bolnaKey}` },
        });
        res = await fetch(`${BOLNA}/providers`, {
          method: 'POST',
          headers: bolnaHeaders(bolnaKey),
          body: JSON.stringify(providerBody),
        });
      }
      const text = await res.text();
      return done(res.status, { name, status: res.status, body: text.slice(0, 200) });
    }

    if (!Array.isArray(body.contact_ids) || body.contact_ids.length === 0) {
      throw new Error('contact_ids (non-empty array) is required');
    }
    if (!body.script_id) throw new Error('script_id is required');

    const bolnaKey = required('BOLNA_API_KEY');
    const supabase = getSupabaseClient();

    // ── Bolna AI-call kill switch (paused till further notice) ──────────────
    // Block all outbound call placement when mkt_engine_config.ai_calls_paused
    // is true. Utility branches above (user_me/get_execution/…) still work.
    // Flip the config value back to false to resume.
    const { data: pauseCfg } = await supabase
      .from('mkt_engine_config')
      .select('config_value')
      .eq('config_key', 'ai_calls_paused')
      .maybeSingle();
    if (pauseCfg?.config_value === true) {
      await logger.info('bolna-calls-paused', { contact_count: body.contact_ids.length });
      return done(200, {
        ok: true,
        skipped: true,
        reason: 'Bolna AI calls paused (mkt_engine_config.ai_calls_paused=true)',
      });
    }

    // Pull triggering user from JWT (best-effort; not auth-gated here).
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
    let triggeredBy: string | null = null;
    if (authHeader) {
      const { data } = await supabase.auth.getUser(authHeader);
      triggeredBy = data.user?.id ?? null;
    }

    // 1. Load script
    const { data: script, error: scriptErr } = await supabase
      .from('mkt_call_scripts')
      .select('id, org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, bolna_agent_id, product_key')
      .eq('id', body.script_id)
      .single<ScriptRow>();
    if (scriptErr || !script) throw new Error(`Script not found: ${scriptErr?.message ?? 'unknown'}`);

    // 1b. Load product (optional — supplies the agent with rich product context)
    let product: ProductRow | null = null;
    if (script.product_key) {
      const { data: prodData } = await supabase
        .from('mkt_products')
        .select('product_key, product_name, product_notes, trial_days')
        .eq('product_key', script.product_key)
        .eq('org_id', script.org_id)
        .maybeSingle<ProductRow>();
      if (prodData) product = prodData;
    }

    // 2. Load contacts (org-scoped)
    const { data: contacts, error: contactsErr } = await supabase
      .from('contacts')
      .select('id, org_id, first_name, last_name, phone, company, job_title')
      .in('id', body.contact_ids)
      .eq('org_id', script.org_id);
    if (contactsErr) throw new Error(`Contacts query failed: ${contactsErr.message}`);

    const validContacts = (contacts ?? []).filter((c: ContactRow) => c.phone && c.phone.trim().length > 0);
    if (validContacts.length === 0) {
      throw new Error('No selected contacts have a phone number');
    }

    // 3. Provision (or reuse) Bolna agent for this script
    let agentId = script.bolna_agent_id;
    if (!agentId) {
      agentId = await createBolnaAgent(bolnaKey, script, product);
      const { error: cacheErr } = await supabase
        .from('mkt_call_scripts')
        .update({ bolna_agent_id: agentId })
        .eq('id', script.id);
      if (cacheErr) await logger.warn('agent-id-cache-failed', { script_id: script.id, error: cacheErr.message });
    }

    // 4. Insert queue rows
    const batchId = crypto.randomUUID();
    const fromNumber = body.from ?? DEFAULT_FROM;
    const queueRows = validContacts.map((c: ContactRow, i: number) => ({
      org_id: script.org_id,
      contact_id: c.id,
      script_id: script.id,
      batch_id: batchId,
      queue_position: i + 1,
      status: 'queued',
      bolna_agent_id: agentId,
      from_phone_number: fromNumber,
      to_phone_number: normalizePhone(c.phone!),
      triggered_by: triggeredBy,
    }));

    const { data: insertedRows, error: insertErr } = await supabase
      .from('mkt_voice_calls')
      .insert(queueRows)
      .select('id, contact_id, queue_position');
    if (insertErr || !insertedRows) throw new Error(`Queue insert failed: ${insertErr?.message ?? 'unknown'}`);

    // 5. Trigger position 1 only — webhook chains the rest sequentially.
    const firstRow = insertedRows.find((r) => r.queue_position === 1)!;
    const firstContact = validContacts.find((c: ContactRow) => c.id === firstRow.contact_id)!;

    const callResult = await triggerBolnaCall(bolnaKey, agentId, firstContact, fromNumber);

    if (callResult.error) {
      await supabase.from('mkt_voice_calls').update({
        status: 'error',
        error_message: callResult.error,
      }).eq('id', firstRow.id);
      await logger.error('first-call-trigger-failed', new Error(callResult.error), { batch_id: batchId });
      return done(200, {
        batch_id: batchId,
        total_queued: insertedRows.length,
        first_call: 'failed',
        error: callResult.error,
      });
    }

    await supabase.from('mkt_voice_calls').update({
      status: 'in-flight',
      bolna_execution_id: callResult.execution_id,
      initiated_at: new Date().toISOString(),
    }).eq('id', firstRow.id);

    await logger.info('bulk-call-batch-started', {
      batch_id: batchId,
      script_id: script.id,
      total_queued: insertedRows.length,
      first_execution_id: callResult.execution_id,
    });

    return done(200, {
      ok: true,
      batch_id: batchId,
      total_queued: insertedRows.length,
      first_call_execution_id: callResult.execution_id,
    });
  } catch (error) {
    await logger.error('bulk-call-error', error);
    return done(500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

async function createBolnaAgent(bolnaKey: string, script: ScriptRow, product: ProductRow | null): Promise<string> {
  const supabaseUrl = required('SUPABASE_URL');
  const webhookUrl = `${supabaseUrl}/functions/v1/mkt-bolna-webhook`;

  const systemPrompt = composeSystemPrompt(script, product);
  const welcomeMessage = script.opening || 'Hello, do you have a moment to talk?';

  const agentBody = {
    agent_config: {
      agent_name: `script-${script.id.slice(0, 8)}-${Date.now()}`,
      agent_welcome_message: welcomeMessage,
      webhook_url: webhookUrl,
      tasks: [{
        task_type: 'conversation',
        toolchain: { execution: 'parallel', pipelines: [['transcriber', 'llm', 'synthesizer']] },
        tools_config: {
          input:  { provider: 'exotel', format: 'wav', samples_per_second: 8000 },
          output: { provider: 'exotel', format: 'wav', samples_per_second: 8000 },
          llm_agent: {
            agent_type: 'simple_llm_agent',
            agent_flow_type: 'streaming',
            llm_config: {
              family: 'openai',
              model: 'gpt-4o-mini',
              temperature: 0.4,
              max_tokens: 100,
            },
          },
          transcriber: {
            provider: 'deepgram',
            model: 'nova-2',
            language: script.language || 'en',
            stream: true,
            encoding: 'linear16',
            endpointing: 400,
          },
          synthesizer: {
            provider: 'elevenlabs',
            stream: true,
            provider_config: {
              voice: DEFAULT_VOICE_NAME,
              voice_id: script.voice_id || DEFAULT_VOICE_ID,
              model: 'eleven_turbo_v2_5',
            },
          },
        },
        task_config: {
          hangup_after_silence: 10,
          call_terminate: script.max_duration_seconds || 300,
          backchanneling: false,
          check_if_user_online: false,
        },
      }],
    },
    agent_prompts: {
      task_1: { system_prompt: systemPrompt },
    },
  };

  const res = await fetch(`${BOLNA}/v2/agent`, {
    method: 'POST',
    headers: bolnaHeaders(bolnaKey),
    body: JSON.stringify(agentBody),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Bolna agent create failed: ${res.status} ${text}`);
  let json: { agent_id?: string; id?: string };
  try { json = JSON.parse(text); } catch { throw new Error(`Bolna agent response not JSON: ${text}`); }
  const id = json.agent_id ?? json.id;
  if (!id) throw new Error(`Bolna agent response missing id: ${text}`);
  return id;
}

function composeSystemPrompt(script: ScriptRow, product: ProductRow | null): string {
  const keyPoints = Array.isArray(script.key_points) ? script.key_points as string[] : [];
  const objections = (script.objection_handling && typeof script.objection_handling === 'object')
    ? script.objection_handling as Record<string, string>
    : {};

  const productLabel = product?.product_name || 'our product';
  const parts: string[] = [
    `You are an AI sales agent for ${productLabel}, calling {first_name} {last_name} from {company}.`,
    `Your objective: ${script.objective}`,
    '',
    `Opening line:`,
    script.opening,
    '',
  ];

  if (keyPoints.length > 0) {
    parts.push('Key talking points (weave these in naturally):');
    for (const p of keyPoints) parts.push(`- ${p}`);
    parts.push('');
  }

  const objKeys = Object.keys(objections);
  if (objKeys.length > 0) {
    parts.push('If they raise objections, here is how to respond:');
    for (const k of objKeys) parts.push(`\n${k}:\n${objections[k]}`);
    parts.push('');
  }

  if (script.closing) {
    parts.push(`Closing:`);
    parts.push(script.closing);
    parts.push('');
  }

  if (product?.product_notes) {
    parts.push('=== Product Reference (use this to answer detailed questions during the call. Treat these facts as authoritative; never invent pricing, features, or customer names outside this section.) ===');
    parts.push(product.product_notes);
    parts.push('=== End Product Reference ===');
    parts.push('');
  }

  parts.push(
    '=== Speaking style (CRITICAL) ===',
    'Speak in very short sentences. Maximum one to two short sentences per turn before pausing for the prospect.',
    'Never deliver a monologue. Use full stops (not em-dashes) so the synthesizer pauses naturally between sentences.',
    'Listen actively, be warm but brief. Imagine you are talking to a busy CFO who is done with vendor calls.',
    '',
    '=== Pronunciation rules (CRITICAL — the synthesizer reads your text literally) ===',
    'Say "Pan" as a word (rhymes with "fan"). Never write "PAN" in your spoken output — write "Pan" or "Pan card".',
    'Say "rupees" always. Never say "R S" or write "Rs".',
    'Say "G S T" letter by letter — write "G S T" with spaces so the synthesizer spells it correctly.',
    'Say "D P D P" letter by letter for the DPDP Act.',
    'Say "Aadhaar" as a natural word.',
    'For amounts, prefer spoken form: "fifty lakh rupees", "two thousand nine hundred ninety-nine rupees".',
    '',
    `Speak in clear, natural ${script.language === 'hi' ? 'Hindi' : 'English'}.`
  );

  return parts.join('\n');
}

async function triggerBolnaCall(
  bolnaKey: string,
  agentId: string,
  contact: ContactRow,
  fromNumber: string,
): Promise<{ execution_id?: string; error?: string }> {
  const callBody = {
    agent_id: agentId,
    recipient_phone_number: normalizePhone(contact.phone!),
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
    headers: bolnaHeaders(bolnaKey),
    body: JSON.stringify(callBody),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { /* keep raw */ }

  if (!res.ok) return { error: `${res.status}: ${text}` };
  const execId = (json.execution_id as string) || (json.run_id as string);
  if (!execId) return { error: `No execution_id in Bolna response: ${text}` };
  return { execution_id: execId };
}

function normalizePhone(p: string): string {
  const trimmed = (p || '').trim();
  if (trimmed.startsWith('+')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return trimmed;
}

function bolnaHeaders(key: string): HeadersInit {
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function done(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
