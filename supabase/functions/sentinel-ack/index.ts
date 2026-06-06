// Acknowledgment endpoint for Health Sentinel escalations.
// The WhatsApp "Acknowledge" button / email link opens this with a per-incident
// token. Tapping stops the repeating escalation; the "RESTORED" notice still
// fires once the break is actually fixed.
//
// TWO-STEP BY DESIGN: a GET only RENDERS a confirm page; the ack is recorded
// only on the POST from the confirm button. This defeats email link-preview /
// security scanners that auto-fetch (GET) links in messages — which previously
// auto-acknowledged a live outage. A human tap is a deliberate POST.
//
// verify_jwt=false: it's a phone/browser action; the random per-incident token
// is the authorisation.
const MGMT = "https://api.supabase.com";
const CRM = "mlvgqudcwlkolsbighnn";

function page(title: string, body: string, color = "#111") {
  return new Response(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"></head><body style="font-family:system-ui,Arial;text-align:center;padding:56px 24px;color:#111"><h2 style="color:${color}">${title}</h2><p style="color:#555;font-size:15px;max-width:460px;margin:8px auto">${body}</p></body></html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}

async function recordAck(token: string, via: string) {
  const q = `update sentinel_incidents set acknowledged_at=now(), acknowledged_via='${via}', updated_at=now() where ack_token='${token}' and status='open' and acknowledged_at is null returning project, system`;
  const r = await fetch(`${MGMT}/v1/projects/${CRM}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("MGMT_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }),
  });
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = (url.searchParams.get("token") || "").replace(/[^a-z0-9]/gi, ""); // hex only
  const via = (url.searchParams.get("via") || "link").replace(/[^a-z]/gi, "").slice(0, 16) || "link";
  if (!token) return page("Invalid link", "No acknowledgment token supplied.");

  // Only a deliberate POST (confirm tap) records the acknowledgment.
  if (req.method === "POST") {
    const rows = await recordAck(token, via);
    if (rows.length > 0) {
      return page("✔ Acknowledged", `<b>${rows[0].system}</b> on <b>${rows[0].project}</b> — escalation stopped. You'll still get the <b>RESTORED</b> notice once it's fixed.`, "#15803d");
    }
    return page("Nothing to acknowledge", "This alert was already acknowledged or has been resolved.");
  }

  // GET → confirm screen (scanners stop here; they never POST).
  return new Response(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"></head>
<body style="font-family:system-ui,Arial;text-align:center;padding:56px 24px;color:#111">
<h2 style="color:#b91c1c">Acknowledge this alert?</h2>
<p style="color:#555;font-size:15px;max-width:460px;margin:8px auto 24px">Confirm you're handling it — this stops the repeat alerts. You'll still be told when it's resolved.</p>
<form method="POST" action="?token=${token}&via=${via}">
<button type="submit" style="background:#b91c1c;color:#fff;padding:14px 30px;border:0;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer">Yes, I'm on it</button>
</form></body></html>`,
    { headers: { "Content-Type": "text/html" } },
  );
});
