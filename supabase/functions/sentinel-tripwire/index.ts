// sentinel-tripwire — the watcher for the watchman.
//
// The Health Sentinel's failure mode is SILENCE: a 401'd invoker, a revoked
// MGMT_TOKEN, or a dead cron produces no email and no incident row, so nothing
// alarms — which is exactly how the 2026-06-03 missing-digest incident went
// unnoticed. This function closes that hole by applying the Sentinel's own
// founding principle TO the Sentinel: assert its heartbeat and alarm on its
// ABSENCE.
//
// Independence (so the bug that kills the Sentinel can't also kill this):
//   • verify_jwt=false  → the cron→function call can NEVER 401, whatever key
//     format the worker carries (that 401 was the original outage).
//   • reads the heartbeat via PostgREST with the auto-injected service-role key
//     → no dependency on MGMT_TOKEN (whose loss takes the whole Sentinel down).
//   • alerts via Resend + Exotel DIRECTLY → no edge-function hop to fail.
//   • FAIL-LOUD: if it can't even read the heartbeat, it pages anyway.
//
// Secrets (all already on the crm project): RESEND_API_KEY, HEALTH_WA_TEMPLATE,
// EXOTEL_WA_SID / EXOTEL_WA_API_KEY / EXOTEL_WA_API_TOKEN, EXOTEL_SENDER_NUMBER.
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected by the platform.

const OPS_EMAIL = "a@in-sync.co.in";
const OPS_WA = "+917738919680";
const FROM = "In-Sync Sentinel Tripwire <notifications@in-sync.co.in>";

// How stale each pulse may get before it counts as "the Sentinel went dark".
// watch = stamped every hourly run → a short fuse catches a total death fast.
// digest = stamped only on the daily 08:00 IST report → must clear a full day.
const MAX_AGE_MIN: Record<string, number> = { watch: 6 * 60, digest: 26 * 60 };
const LABEL: Record<string, string> = { watch: "hourly watch run", digest: "daily 08:00 IST digest email" };

const ist = (d: Date) =>
  d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

async function readHeartbeats(): Promise<{ ok: true; rows: any[] } | { ok: false; err: string }> {
  const base = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key) return { ok: false, err: "SUPABASE_URL / service-role key not injected" };
  try {
    const r = await fetch(`${base}/rest/v1/sentinel_heartbeat?select=kind,last_ok_at,detail`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!r.ok) return { ok: false, err: `heartbeat read HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` };
    return { ok: true, rows: await r.json() };
  } catch (e) {
    return { ok: false, err: `heartbeat read threw: ${e}` };
  }
}

async function sendEmail(subject: string, html: string) {
  const k = Deno.env.get("RESEND_API_KEY");
  if (!k) return "email skipped (no RESEND_API_KEY)";
  for (let i = 0; i < 4; i++) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [OPS_EMAIL], subject, html }),
    });
    if (r.status !== 429) return `email ${r.status}`;
    await new Promise((res) => setTimeout(res, 1200 * (i + 1)));
  }
  return "email 429 (gave up)";
}

async function sendWhatsApp(text: string) {
  const tpl = Deno.env.get("HEALTH_WA_TEMPLATE");
  const sid = Deno.env.get("EXOTEL_WA_SID"), key = Deno.env.get("EXOTEL_WA_API_KEY"), tok = Deno.env.get("EXOTEL_WA_API_TOKEN");
  const from = Deno.env.get("EXOTEL_SENDER_NUMBER");
  if (!tpl || !sid || !key || !tok || !from) return "wa skipped (creds/template missing)";
  try {
    const r = await fetch(`https://${key}:${tok}@api.exotel.com/v2/accounts/${sid}/messages?waba_id=${Deno.env.get("EXOTEL_WABA")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ custom_data: "sentinel-tripwire", whatsapp: { messages: [{ from, to: OPS_WA, content: { type: "template", template: { name: tpl, language: { code: "en" }, components: [{ type: "body", parameters: [{ type: "text", text: text.slice(0, 600) }] }] } } }] } }),
    });
    return `wa ${r.status}`;
  } catch (e) { return `wa err ${e}`; }
}

Deno.serve(async (req) => {
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const now = Date.now();

  const hb = await readHeartbeats();
  const problems: string[] = [];

  if (!hb.ok) {
    // Fail loud: if we can't even verify the Sentinel, assume the worst and page.
    problems.push(`Cannot verify the Health Sentinel — ${hb.err}`);
  } else {
    const byKind = new Map(hb.rows.map((r) => [r.kind, r]));
    for (const kind of Object.keys(MAX_AGE_MIN)) {
      const row = byKind.get(kind);
      if (!row) { problems.push(`No ${LABEL[kind]} has EVER been recorded — Sentinel has never run successfully.`); continue; }
      const ageMin = Math.round((now - new Date(row.last_ok_at).getTime()) / 60000);
      if (ageMin > MAX_AGE_MIN[kind]) {
        problems.push(`${LABEL[kind]} last succeeded ${ist(new Date(row.last_ok_at))} IST — ${Math.round(ageMin / 60)}h ago (limit ${MAX_AGE_MIN[kind] / 60}h). The Sentinel has gone dark.`);
      }
    }
  }

  const healthy = problems.length === 0;
  let sent: string[] = [];

  if (!healthy && !dry) {
    const list = problems.map((p) => `<li>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</li>`).join("");
    const line = `🚨 Health Sentinel TRIPWIRE: ${problems.join(" | ")}`;
    const html = `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;color:#111">`
      + `<h2 style="color:#b91c1c;margin:0 0 8px">🚨 The Health Sentinel has gone silent</h2>`
      + `<p>The watchman that checks all ${"13"} projects is itself not reporting. Until it's restored, <b>you are flying blind</b> — outages elsewhere will NOT be caught.</p>`
      + `<ul>${list}</ul>`
      + `<p style="color:#555">Likely causes: the cron worker's key was rotated to a non-JWT format (verify_jwt 401), MGMT_TOKEN revoked/expired, or the Cloudflare cron stopped firing. Check <code>crm-cron-health-sentinel</code> / <code>-watch</code> and the crm <code>health-sentinel</code> function logs.</p></div>`;
    sent = await Promise.all([
      sendEmail(`🚨 TRIPWIRE — Health Sentinel is down`, html),
      sendWhatsApp(line),
    ]);
  }

  return new Response(JSON.stringify({
    ok: true, healthy, dry,
    heartbeats: hb.ok ? hb.rows : `READ FAILED: ${hb.err}`,
    problems, alerts: dry ? "(dry run — not sent)" : healthy ? "(healthy — nothing sent)" : sent,
  }, null, 2), { headers: { "Content-Type": "application/json" } });
});
