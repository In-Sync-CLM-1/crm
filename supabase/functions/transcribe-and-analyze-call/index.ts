// Transcribes a call recording with Groq Whisper and analyzes the transcript
// with Groq (1st choice) / Cerebras (2nd-choice fallback). Works for both
// call_logs (click-to-call) and
// mkt_voice_calls (Bolna agentic). For Bolna calls without a recording yet
// (recording was enabled mid-May 2026), it can ingest a transcript supplied
// in the request body.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { jsonResponse, errorResponse, handleCors } from '../_shared/responseHelpers.ts';

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!;
const CEREBRAS_API_KEY = Deno.env.get('CEREBRAS_API_KEY') || '';
const BOLNA_API_KEY = Deno.env.get('BOLNA_API_KEY') || '';
const EXOTEL_API_KEY = Deno.env.get('EXOTEL_API_KEY') || '';
const EXOTEL_API_TOKEN = Deno.env.get('EXOTEL_API_TOKEN') || '';

const GROQ_WHISPER_MODEL = 'whisper-large-v3-turbo';
const GROQ_TEXT_MODEL = 'llama-3.3-70b-versatile';
const CEREBRAS_MODEL = 'gemma-4-31b';

async function fetchBolnaTranscript(executionId: string): Promise<string | null> {
  if (!BOLNA_API_KEY) return null;
  const r = await fetch(`https://api.bolna.ai/executions/${executionId}`, {
    headers: { Authorization: `Bearer ${BOLNA_API_KEY}` },
  });
  if (!r.ok) return null;
  const data = await r.json();
  return (data?.transcript || '').trim() || null;
}

type CallKind = 'human' | 'agentic';

interface AnalysisResult {
  summary: string;
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  quality_score: number;
  key_points: string[];
  objections: string[];
  follow_up_action: string;
  customer_intent: string;
  agent_strengths: string[];
  agent_improvements: string[];
}

async function transcribeWithGroq(recordingUrl: string): Promise<string> {
  // Exotel recording URLs require Basic Auth with the API key/token.
  const headers: HeadersInit = {};
  if (/(?:exotel\.com|recordings\.[a-z0-9-]+\.exotel\.com)/i.test(recordingUrl) && EXOTEL_API_KEY) {
    headers['Authorization'] = `Basic ${btoa(`${EXOTEL_API_KEY}:${EXOTEL_API_TOKEN}`)}`;
  }
  const audioRes = await fetch(recordingUrl, { headers });
  if (!audioRes.ok) throw new Error(`Recording fetch failed: ${audioRes.status}`);
  const audioBlob = await audioRes.blob();

  const form = new FormData();
  form.append('file', audioBlob, 'recording.mp3');
  form.append('model', GROQ_WHISPER_MODEL);
  form.append('response_format', 'verbose_json');
  form.append('language', 'en');
  form.append('temperature', '0');

  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: form,
  });
  if (!r.ok) throw new Error(`Groq Whisper failed: ${r.status} ${await r.text()}`);
  const data = await r.json();
  return (data.text || '').trim();
}

async function analyzeCall(opts: {
  transcript: string;
  callKind: CallKind;
  fromNumber?: string | null;
  toNumber?: string | null;
  durationSec?: number | null;
}): Promise<AnalysisResult> {
  const kindLabel = opts.callKind === 'agentic'
    ? 'an AI voicebot agent (Bolna) calling a prospect'
    : 'a human sales agent on a phone call';

  const systemPrompt = `You are reviewing a B2B sales/customer call from In-Sync, an Indian vendor due-diligence and KYC platform. The call is ${kindLabel}.

You output ONLY a JSON object with exactly these keys:
- summary (string, 2-3 sentences, plain English, business-focused)
- sentiment (one of: positive, neutral, negative, mixed)
- quality_score (integer 1-5; 1=poor, 5=excellent — judge the AGENT's performance, not the outcome)
- key_points (array of 3-6 short bullets)
- objections (array, customer concerns/blockers; [] if none)
- follow_up_action (string, the single most important next step)
- customer_intent (string, one sentence on what the customer wants/feels)
- agent_strengths (array, 1-3 short bullets — what the agent did well)
- agent_improvements (array, 1-3 short bullets — what could be better)

Be concrete and specific. Use the customer's actual words where useful. Indian English is the norm.`;

  const userContent = `Call metadata:
- Type: ${opts.callKind}
- From: ${opts.fromNumber || 'unknown'}
- To: ${opts.toNumber || 'unknown'}
- Duration: ${opts.durationSec ?? '?'}s

Transcript:
${opts.transcript}`;

  // Text-only analysis — Groq (1st choice), Cerebras (2nd-choice fallback).
  async function callGroqAnalysis(): Promise<AnalysisResult | null> {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: GROQ_TEXT_MODEL,
          max_tokens: 1024,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
        }),
      });
      if (!r.ok) return null;
      const data = await r.json();
      const text = data?.choices?.[0]?.message?.content || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      return jsonMatch ? (JSON.parse(jsonMatch[0]) as AnalysisResult) : null;
    } catch { return null; }
  }

  async function callCerebrasAnalysis(): Promise<AnalysisResult | null> {
    if (!CEREBRAS_API_KEY) return null;
    try {
      const r = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${CEREBRAS_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: CEREBRAS_MODEL,
          max_tokens: 1024,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
        }),
      });
      if (!r.ok) return null;
      const data = await r.json();
      const text = data?.choices?.[0]?.message?.content || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      return jsonMatch ? (JSON.parse(jsonMatch[0]) as AnalysisResult) : null;
    } catch { return null; }
  }

  const result = (await callGroqAnalysis()) ?? (await callCerebrasAnalysis());
  if (!result) throw new Error('Call analysis failed on both Groq and Cerebras');
  return result;
}

async function processCall(opts: {
  table: 'call_logs' | 'mkt_voice_calls';
  callId: string;
  callKind: CallKind;
  forceReanalyze?: boolean;
  suppliedTranscript?: string;
}) {
  const supabase = getSupabaseClient();
  const { table, callId, callKind, forceReanalyze, suppliedTranscript } = opts;

  const fromCol = table === 'call_logs' ? 'from_number' : 'from_phone_number';
  const toCol = table === 'call_logs' ? 'to_number' : 'to_phone_number';
  const durCol = table === 'call_logs' ? 'conversation_duration' : 'duration_sec';
  const extraCols = table === 'mkt_voice_calls' ? ', bolna_execution_id' : '';

  const { data: row, error: rowErr } = await supabase
    .from(table)
    .select(`id, recording_url, transcript, analyzed_at, ${fromCol}, ${toCol}, ${durCol}${extraCols}`)
    .eq('id', callId)
    .single();

  if (rowErr || !row) throw new Error(`Call ${callId} not found in ${table}`);
  if (row.analyzed_at && !forceReanalyze) {
    return { skipped: true, reason: 'already analyzed' };
  }

  let transcript = (row as any).transcript as string | null;
  let transcriptProvider: string | null = null;

  if (suppliedTranscript) {
    transcript = suppliedTranscript;
    transcriptProvider = 'bolna';
  } else if (!transcript) {
    if (row.recording_url) {
      transcript = await transcribeWithGroq(row.recording_url);
      transcriptProvider = `groq:${GROQ_WHISPER_MODEL}`;
    } else if (table === 'mkt_voice_calls' && (row as any).bolna_execution_id) {
      transcript = await fetchBolnaTranscript((row as any).bolna_execution_id);
      transcriptProvider = 'bolna';
    }
    if (!transcript) {
      await supabase.from(table)
        .update({ analysis_error: 'no recording and no transcript', analyzed_at: new Date().toISOString() })
        .eq('id', callId);
      return { skipped: true, reason: 'no recording' };
    }
  }

  if (!transcript || transcript.length < 5) {
    await supabase.from(table)
      .update({ analysis_error: 'transcript empty', analyzed_at: new Date().toISOString() })
      .eq('id', callId);
    return { skipped: true, reason: 'empty transcript' };
  }

  const analysis = await analyzeCall({
    transcript,
    callKind,
    fromNumber: (row as any)[fromCol],
    toNumber: (row as any)[toCol],
    durationSec: (row as any)[durCol],
  });

  const updatePayload: Record<string, unknown> = {
    transcript,
    ai_summary: analysis.summary,
    ai_analysis: analysis,
    quality_score: analysis.quality_score,
    sentiment: analysis.sentiment,
    analyzed_at: new Date().toISOString(),
    analysis_provider: `anthropic:${HAIKU_MODEL}`,
    analysis_error: null,
  };
  if (transcriptProvider) {
    updatePayload.transcript_provider = transcriptProvider;
    updatePayload.transcribed_at = new Date().toISOString();
  }

  await supabase.from(table).update(updatePayload).eq('id', callId);
  return { ok: true, quality_score: analysis.quality_score, sentiment: analysis.sentiment };
}

async function processBatch(opts: { limit?: number; force?: boolean }) {
  const supabase = getSupabaseClient();
  const limit = Math.min(opts.limit ?? 25, 100);

  const { data: humanCalls = [] } = await supabase
    .from('call_logs')
    .select('id')
    .not('recording_url', 'is', null)
    .is('analyzed_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  const { data: agenticCalls = [] } = await supabase
    .from('mkt_voice_calls')
    .select('id')
    .or('recording_url.not.is.null,transcript.not.is.null,bolna_execution_id.not.is.null')
    .is('analyzed_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  const results = { processed: 0, ok: 0, skipped: 0, errors: [] as string[] };

  async function markFailed(table: 'call_logs' | 'mkt_voice_calls', id: string, msg: string) {
    await supabase.from(table).update({
      analysis_error: msg.slice(0, 500),
      analyzed_at: new Date().toISOString(),
    }).eq('id', id);
  }

  for (const row of humanCalls || []) {
    results.processed++;
    try {
      const r = await processCall({ table: 'call_logs', callId: row.id, callKind: 'human', forceReanalyze: opts.force });
      if (r.ok) results.ok++; else results.skipped++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.errors.push(`call_logs/${row.id}: ${msg}`);
      await markFailed('call_logs', row.id, msg);
    }
  }

  for (const row of agenticCalls || []) {
    results.processed++;
    try {
      const r = await processCall({ table: 'mkt_voice_calls', callId: row.id, callKind: 'agentic', forceReanalyze: opts.force });
      if (r.ok) results.ok++; else results.skipped++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.errors.push(`mkt_voice_calls/${row.id}: ${msg}`);
      await markFailed('mkt_voice_calls', row.id, msg);
    }
  }

  return results;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    let body: any = {};
    try { body = await req.json(); } catch (_) { /* empty body ok */ }

    // Mode 1: single-call analysis
    if (body?.call_id && body?.table) {
      const r = await processCall({
        table: body.table,
        callId: body.call_id,
        callKind: body.call_kind || (body.table === 'mkt_voice_calls' ? 'agentic' : 'human'),
        forceReanalyze: !!body.force,
        suppliedTranscript: body.transcript,
      });
      return jsonResponse(r);
    }

    // Mode 2: batch — used by daily cron + manual UI refresh
    const r = await processBatch({ limit: body?.limit, force: !!body?.force });
    return jsonResponse(r);
  } catch (e) {
    return errorResponse(e);
  }
});
