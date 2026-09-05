// Call-context resolver for Health Sentinel's escalation call — the endpoint
// the shared insync-exotel-bridge (project key "crm") hits at call-start time
// to get {system_prompt, call_id, webhook_url, webhook_auth_token}. Replaces
// the retired Bolna integration; the LiveKit agent that answers this call is
// the same reusable one RMPL/GlobalCRM use (see ai-calling/README.md), not a
// crm-specific build.
//
// Correlation: matched on Exotel's own call_sid, which the bridge forwards
// here as ?call_sid=.... health-sentinel stores it against the incident
// (last_ai_call_sid) right after Exotel returns it from placing the call.
// CustomField=<ack_token> was tried first but proven live 2026-09-05 not to
// survive into the Voicebot Applet's WebSocket start event (only the earlier
// HTTP callback sees it) — call_sid is what actually round-trips.
//
// verify_jwt=false: the bridge calls this server-to-server, authenticated by
// SENTINEL_AI_CALL_SECRET (Bearer), not a Supabase JWT.
const CRM_REF = "mlvgqudcwlkolsbighnn";

function checkAuth(req: Request): boolean {
  const secret = Deno.env.get("SENTINEL_AI_CALL_SECRET");
  if (!secret) return false;
  return req.headers.get("Authorization") === `Bearer ${secret}`;
}

async function sql(query: string): Promise<any[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${CRM_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("MGMT_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? j : [];
}

const qs = (s: string) => "'" + s.replace(/'/g, "''") + "'";

Deno.serve(async (req) => {
  if (!checkAuth(req)) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  const url = new URL(req.url);
  const callSidParam = (url.searchParams.get("call_sid") || "").replace(/[^a-z0-9]/gi, "");

  const rows = callSidParam
    ? await sql(`select project, system, detail, ack_token from sentinel_incidents where last_ai_call_sid=${qs(callSidParam)} and status='open' and acknowledged_at is null limit 1`)
    // No call_sid on this request (shouldn't happen — Exotel always includes CallSid on the
    // Voicebot Applet callback) — fall back to the most recently updated open, unacknowledged
    // incident rather than failing the call outright.
    : await sql(`select project, system, detail, ack_token from sentinel_incidents where status='open' and acknowledged_at is null and last_ai_call_sid is not null order by updated_at desc limit 1`);

  const inc = rows[0];
  if (!inc) {
    return new Response(JSON.stringify({ error: "no matching open incident" }), { status: 404 });
  }

  const systemPrompt = `You are calling on behalf of In-Sync's Health Sentinel, an automated system monitor, to deliver an urgent operational alert by voice.

=== Speaking style (CRITICAL, the synthesizer reads your text literally) ===
Speak in short sentences, one to two at most before pausing. Never deliver a monologue. Keep the whole call under a minute.

=== The alert ===
"${inc.system}" on the "${inc.project}" project is down. ${inc.detail || "See the alert email or WhatsApp message for details."}

=== Goal ===
1. Deliver the alert above, once, clearly.
2. Ask the person to say the word "NOTED" to acknowledge it and stop further escalation calls.
3. If they say "NOTED" (or a clear equivalent acknowledgment), thank them briefly and end the call.
4. If they seem confused or don't respond, repeat the alert once, then end politely.

=== Boundaries ===
Do not invent technical detail beyond what's given above. If asked something you can't answer, tell them to check their email or WhatsApp for the full alert.`;

  return new Response(JSON.stringify({
    system_prompt: systemPrompt,
    call_id: inc.ack_token,
    webhook_url: `https://${CRM_REF}.supabase.co/functions/v1/sentinel-ai-call-webhook`,
    webhook_auth_token: Deno.env.get("SENTINEL_AI_CALL_SECRET"),
  }), { headers: { "Content-Type": "application/json" } });
});
