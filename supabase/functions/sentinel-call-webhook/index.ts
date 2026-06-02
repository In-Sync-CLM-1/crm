// Bolna posts the call result here when a Sentinel alert call ends.
// Per the user's rule: if the operator PICKED UP and said "NOTED", treat the
// call itself as an acknowledgment and stop escalation (same effect as tapping
// the email/WhatsApp ack link). The incident is matched by the ack_token we put
// in user_data, which round-trips back as context_details. verify_jwt=false:
// Bolna calls it server-to-server (Bolna egress IP 13.203.39.153).
const MGMT = "https://api.supabase.com";
const CRM = "mlvgqudcwlkolsbighnn";

Deno.serve(async (req) => {
  let ev: any = {};
  try { ev = await req.json(); } catch { /* ignore */ }

  const token = String(ev?.context_details?.ack_token || ev?.user_data?.ack_token || "").replace(/[^a-z0-9]/gi, "");
  const tel = ev?.telephony_data || {};
  const dur = Number(tel.duration || 0);
  const voicemail = ev?.answered_by_voice_mail === true;
  const transcript = String(ev?.transcript || "").toLowerCase();

  const pickedUp = !voicemail && dur > 0;          // a real person answered
  const saidNoted = /\bnoted\b/.test(transcript);  // and gave the agreed response
  const acknowledged = pickedUp && saidNoted;

  if (token && acknowledged) {
    const q = `update sentinel_incidents set acknowledged_at=now(), escalated_call_at=now(), updated_at=now() where ack_token='${token}' and status='open' and acknowledged_at is null returning project, system`;
    const r = await fetch(`${MGMT}/v1/projects/${CRM}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("MGMT_TOKEN")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }),
    });
    const j = await r.json().catch(() => null);
    const hit = Array.isArray(j) && j.length > 0;
    return new Response(JSON.stringify({ ok: true, acknowledged: hit }), { headers: { "Content-Type": "application/json" } });
  }
  // Not an ack (voicemail, no pickup, or "NOTED" not said) — escalation continues.
  return new Response(JSON.stringify({ ok: true, acknowledged: false, pickedUp, saidNoted }), { headers: { "Content-Type": "application/json" } });
});
