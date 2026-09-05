// The shared LiveKit voice agent posts the call result here when a Health
// Sentinel escalation call ends. Replaces sentinel-call-webhook (Bolna-shaped
// payload; Bolna is retired). Per the user's rule: if the operator PICKED UP
// and said "NOTED", treat the call itself as an acknowledgment and stop
// escalation (same effect as tapping the email/WhatsApp ack link). The
// incident is matched by call_id, which is the incident's own ack_token —
// see sentinel-ai-call-context, which set call_id=ack_token when it composed
// this call's script.
//
// verify_jwt=false: the agent calls this server-to-server, authenticated by
// SENTINEL_AI_CALL_SECRET (Bearer), not a Supabase JWT.
const MGMT = "https://api.supabase.com";
const CRM = "mlvgqudcwlkolsbighnn";

Deno.serve(async (req) => {
  const secret = Deno.env.get("SENTINEL_AI_CALL_SECRET");
  if (!secret || req.headers.get("Authorization") !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  let ev: any = {};
  try { ev = await req.json(); } catch { /* ignore */ }

  const token = String(ev?.call_id || "").replace(/[^a-z0-9]/gi, "");
  const duration = Number(ev?.duration_seconds || 0);
  const transcript = String(ev?.transcript || "").toLowerCase();

  // >=5s mirrors the same "actually connected, not just rang" bar used
  // elsewhere for this agent (see placeAiCall.ts) — voicemail/no-answer never
  // accumulates real conversation seconds.
  const pickedUp = duration >= 5;
  const saidNoted = /\bnoted\b/.test(transcript);
  const acknowledged = pickedUp && saidNoted;

  if (token && acknowledged) {
    const q = `update sentinel_incidents set acknowledged_at=now(), updated_at=now() where ack_token='${token}' and status='open' and acknowledged_at is null returning project, system`;
    const r = await fetch(`${MGMT}/v1/projects/${CRM}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("MGMT_TOKEN")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }),
    });
    const j = await r.json().catch(() => null);
    const hit = Array.isArray(j) && j.length > 0;
    return new Response(JSON.stringify({ ok: true, acknowledged: hit }), { headers: { "Content-Type": "application/json" } });
  }
  // Not an ack (no pickup, or "NOTED" not said) — escalation continues.
  return new Response(JSON.stringify({ ok: true, acknowledged: false, pickedUp, saidNoted }), { headers: { "Content-Type": "application/json" } });
});
