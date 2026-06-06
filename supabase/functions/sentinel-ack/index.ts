// Public acknowledgment endpoint for Health Sentinel escalations.
// The escalation email / WhatsApp includes a link here with a per-incident token;
// tapping it stops the repeating WhatsApp + AI-call escalation. The user still
// gets the "RESTORED" notice once the underlying break is actually fixed.
// verify_jwt=false: it's a browser link tapped from a phone; the secret token
// (random hex per incident) is the authorisation.
const MGMT = "https://api.supabase.com";
const CRM = "mlvgqudcwlkolsbighnn";

function page(title: string, body: string) {
  return new Response(
    `<!doctype html><html><body style="font-family:system-ui,Arial;text-align:center;padding:64px 24px;color:#111"><h2>${title}</h2><p style="color:#555;font-size:15px">${body}</p></body></html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}

Deno.serve(async (req) => {
  const params = new URL(req.url).searchParams;
  const token = (params.get("token") || "").replace(/[^a-z0-9]/gi, ""); // sanitise: hex only
  // Which channel the operator tapped from — recorded for the audit trail.
  const via = (params.get("via") || "link").replace(/[^a-z]/gi, "").slice(0, 16) || "link";
  if (!token) return page("Invalid link", "No acknowledgment token supplied.");
  const q = `update sentinel_incidents set acknowledged_at=now(), acknowledged_via='${via}', updated_at=now() where ack_token='${token}' and status='open' and acknowledged_at is null returning project, system`;
  const r = await fetch(`${MGMT}/v1/projects/${CRM}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("MGMT_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }),
  });
  const j = await r.json();
  if (Array.isArray(j) && j.length > 0) {
    return page("✔ Acknowledged", `${j[0].system} on ${j[0].project} — escalation stopped. You'll still get the <b>RESTORED</b> notice once it's fixed.`);
  }
  return page("Nothing to acknowledge", "This alert was already acknowledged or has been resolved.");
});
