// Health Sentinel — daily fleet-wide pre-flight check.
//
// Runs every morning (before the workday) and ACTIVELY probes every Supabase
// project in the org, then emails one failure-led green/red checklist per
// project to the ops address. The guiding principle: you cannot catch a system
// that has gone silent from its error logs — you must assert the heartbeat and
// alarm on its ABSENCE. Each check below maps to a real silent-failure class
// we have actually been burned by.
//
// Auth: invoked by the crm cron-worker (Bearer = crm legacy service_role JWT),
// so it runs as a normal verify_jwt=true function.
//
// Secrets it needs on the crm project:
//   MGMT_TOKEN      — org-wide Supabase Management API access token (sbp_...)
//   RESEND_API_KEY  — for sending the report email
// Everything else (per-project refs, keys, config) is discovered at runtime via
// the Management API, so coverage stays comprehensive as projects come and go.

const MGMT = "https://api.supabase.com";
const OPS_EMAIL = "a@in-sync.co.in";
const FROM = "In-Sync Health Sentinel <notifications@in-sync.co.in>";

// Per-project metadata. Projects not listed here still get the generic checks
// (a brand-new project is covered automatically); listed flags add specialised
// checks. Keep this in sync with the org as products are added.
//   web: the live URL real visitors hit. Drives the frontend render probe.
//        undefined → flagged amber as "not monitored" (so a coverage gap is
//        never silent — this is the lesson from the fieldsync blank-screen
//        outage). Set web:null to intentionally opt a backend-only project out.
const META: Record<string, { name: string; dialer?: boolean; marketing?: boolean; web?: string | null }> = {
  mlvgqudcwlkolsbighnn: { name: "crm (core)", marketing: true, web: "https://crm.in-sync.co.in" },
  ejzjrvazegaxrhqizgaa: { name: "globalcrm", dialer: true, web: "https://globalcrm.in-sync.co.in" },
  rdhvkluvkieajtmpljyz: { name: "work", web: "https://work.in-sync.co.in" },
  jmxpudhpdltktuupfbxs: { name: "fieldsync", web: "https://field.in-sync.co.in" },
  gwfofzqrfpwojejjodgz: { name: "event", web: "https://event.in-sync.co.in" },
  htdwkhtfdifwajdkkpul: { name: "ats", web: "https://ats-6t2.pages.dev" },
  hmqwmmlqfrrktfsiowdh: { name: "expense", web: "https://expense.in-sync.co.in" },
  fibpamjksquymscdlfal: { name: "vendorverification", web: "https://vendorverification.in-sync.co.in" },
  unmdhcjrplwntqjiciiz: { name: "wa", web: "https://wa.in-sync.co.in" },
  xpndsoozxjrvcwhauunh: { name: "email", web: "https://email.in-sync.co.in" },
  zcmfxpknsybponbudyqb: { name: "smbconnect", web: "https://smbconnect.in" },
  ufwvyybrctjpwipbveqe: { name: "RMPL", web: "https://rmpl-sync.pages.dev" },
  upnhhrhobvdmpfnldvgb: { name: "website", web: "https://in-sync.co.in" },
};

type Status = "ok" | "fail" | "warn";
interface Check { label: string; status: Status; detail: string }

const token = () => Deno.env.get("MGMT_TOKEN") ?? "";

async function mgmtGet(path: string): Promise<{ s: number; j: any }> {
  const r = await fetch(MGMT + path, { headers: { Authorization: `Bearer ${token()}` } });
  let j: any = null;
  try { j = await r.json(); } catch { /* non-json */ }
  return { s: r.status, j };
}

async function sql(ref: string, query: string): Promise<any[]> {
  const r = await fetch(`${MGMT}/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(j?.message || `sql failed (${r.status})`);
  return j;
}

// --- generic checks (every project) -----------------------------------------

async function checkDb(ref: string): Promise<Check> {
  try {
    await sql(ref, "select 1 as ok");
    return { label: "Database reachable", status: "ok", detail: "responding" };
  } catch (e) {
    return { label: "Database reachable", status: "fail", detail: String(e) };
  }
}

async function checkRegistration(ref: string): Promise<Check> {
  try {
    const { s, j } = await mgmtGet(`/v1/projects/${ref}/config/auth`);
    if (s !== 200) return { label: "Registration email", status: "warn", detail: `config unreadable (${s})` };
    const onResend = /resend/i.test(j.smtp_host || "");
    const rate = Number(j.rate_limit_email_sent || 0);
    if (onResend && rate > 2) return { label: "Registration email", status: "ok", detail: `Resend, ${rate}/hr` };
    return {
      label: "Registration email",
      status: "fail",
      detail: `signup mail on ${j.smtp_host ? j.smtp_host : "built-in starter"} @ ${rate}/hr — past the ${rate}/hr signup silently fails`,
    };
  } catch (e) {
    return { label: "Registration email", status: "warn", detail: String(e) };
  }
}

async function checkRlsExposure(ref: string): Promise<Check> {
  try {
    const rows = await sql(
      ref,
      "select tablename from pg_tables where schemaname='public' and rowsecurity=false order by tablename",
    );
    if (rows.length === 0) return { label: "Row-level security", status: "ok", detail: "no public tables exposed" };
    const names = rows.map((r) => r.tablename);
    return {
      label: "Row-level security",
      status: "warn",
      detail: `${names.length} public table(s) with RLS off: ${names.slice(0, 8).join(", ")}${names.length > 8 ? "…" : ""}`,
    };
  } catch (e) {
    return { label: "Row-level security", status: "warn", detail: String(e) };
  }
}

// --- specialised checks ------------------------------------------------------

async function checkDialer(ref: string): Promise<Check[]> {
  const out: Check[] = [];
  try {
    const cfg = await sql(
      ref,
      "select dialing_active, calling_windows from organization_settings where org_id='61f7f96d-e80c-4d9b-a765-8eb32bd3c70d'",
    );
    const active = cfg[0]?.dialing_active === true;
    out.push({
      label: "Dialer switched on",
      status: active ? "ok" : "fail",
      detail: active ? "dialing_active = true" : "dialing_active = false (dialer is OFF)",
    });

    // Ready-to-call leads for each active, owned script (catches an empty queue
    // or a script that lost its owner).
    const cand = await sql(
      ref,
      `select s.name, (select count(*) from get_ai_call_candidates('61f7f96d-e80c-4d9b-a765-8eb32bd3c70d'::uuid, 100000, s.owner_id)) n
       from ai_call_scripts s where s.org_id='61f7f96d-e80c-4d9b-a765-8eb32bd3c70d' and s.is_active=true and s.owner_id is not null`,
    );
    const dry = cand.filter((c) => Number(c.n) === 0).map((c) => c.name);
    const total = cand.reduce((a, c) => a + Number(c.n), 0);
    out.push({
      label: "Leads ready to dial",
      status: dry.length ? "warn" : "ok",
      detail: dry.length ? `${dry.join(", ")} have 0 candidates` : `${total} leads queued across ${cand.length} agent(s)`,
    });

    // Liveness by expected output. CRITICAL: count CONNECTED calls, not attempts.
    // During the 2026-06-05 Exotel outage there were 3,725 attempts but 0 connected
    // — the old "count(*) > 0" check reported a healthy "3725 AI calls" GREEN while
    // not a single call connected. We now split attempts vs connections so a
    // telephony outage (calls placed, none connecting) trips red. 48h window
    // smooths the Sunday no-call day.
    const calls = await sql(
      ref,
      "select count(*) attempts, count(*) filter (where conversation_duration > 0) connected from call_logs where org_id='61f7f96d-e80c-4d9b-a765-8eb32bd3c70d' and caller_type='ai' and created_at > now() - interval '48 hours'",
    );
    const att = Number(calls[0]?.attempts || 0), con = Number(calls[0]?.connected || 0);
    out.push({
      label: "Dialer actually calling",
      status: con > 0 ? "ok" : "fail",
      detail: con > 0
        ? `${con} connected / ${att} attempts in 48h`
        : att > 0
          ? `${att} attempts but ZERO connected in 48h — calls placed, none connecting (telephony/Exotel down)`
          : "ZERO AI calls in 48h — dialer is silent",
    });
  } catch (e) {
    out.push({ label: "Dialer health", status: "warn", detail: String(e) });
  }
  return out;
}

async function checkMarketing(ref: string): Promise<Check> {
  // crm marketing engine heartbeat: a 401'd / paused cron suite goes silent.
  try {
    const rows = await sql(
      ref,
      "select count(*) n from mkt_sequence_actions where coalesce(sent_at, created_at) > now() - interval '24 hours'",
    );
    const n = Number(rows[0]?.n || 0);
    return {
      label: "Marketing engine live",
      status: n > 0 ? "ok" : "warn",
      detail: n > 0 ? `${n} outreach actions in 24h` : "no outreach actions in 24h",
    };
  } catch (e) {
    return { label: "Marketing engine live", status: "warn", detail: String(e) };
  }
}

// --- external API probes (hourly, REAL authenticated round-trips) ------------
// The 2026-06-05 Exotel voice outage (3,725 AI-call attempts, 0 connected, all
// day) was invisible because the Sentinel only watched our own DB + websites,
// never the third-party providers the fleet runs on. Fix: every external API the
// fleet depends on gets a REAL authenticated call each run — not a mock, not a
// table-existence check. Voice is the one path a read-probe cannot validate (the
// API was up while calls failed to connect), so it gets a real test call placed
// to the ops phone; a ring that reaches the carrier = healthy (no human needs to
// answer). Everything else gets a live auth round-trip (no spam, negligible cost).
// Failures flow into the same incident/escalation machinery — email-first, since
// Exotel itself is now a monitored dependency and can't carry its own outage alarm.
const E = (k: string) => Deno.env.get(k) ?? "";

async function tfetch(url: string, init: RequestInit = {}, ms = 12000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(t); }
}

// Run one probe; a thrown error or non-2xx is a red, a missing credential is amber
// ("not probed here" — surfaced so a coverage gap is never silent), success green.
async function probe(label: string, fn: () => Promise<{ ok: boolean; detail: string; skip?: boolean }>): Promise<Check> {
  try {
    const r = await fn();
    return { label, status: r.skip ? "warn" : r.ok ? "ok" : "fail", detail: r.detail };
  } catch (e) {
    return { label, status: "fail", detail: `probe threw: ${String(e).slice(0, 140)}` };
  }
}

// Mint a Google access token from a refresh token (shared by Ads / YouTube).
async function googleAccess(refresh: string): Promise<string | null> {
  try {
    const r = await tfetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: E("GOOGLE_ADS_CLIENT_ID"), client_secret: E("GOOGLE_ADS_CLIENT_SECRET"), refresh_token: refresh, grant_type: "refresh_token" }),
    });
    const j = await r.json().catch(() => ({}));
    return j?.access_token || null;
  } catch { return null; }
}

// Voice: place a real call via the production path (Bolna→Exotel) AND verify the
// PREVIOUS run's call reached the carrier (end-to-end), PLUS watch the live
// connect-rate of organic AI calls. `live` gates the outward call + DB writes so
// dry runs stay side-effect-free.
async function probeVoice(live: boolean): Promise<Check[]> {
  const out: Check[] = [];
  const agent = E("HEALTH_BOLNA_AGENT"), bkey = E("BOLNA_API_KEY");

  // 1) Verify the previous probe call end-to-end (1-hour lag, but a true connect check).
  if (live) {
    try {
      const prev = await sql(CRM_REF, "select id, execution_id from voice_probe_log where verified=false and execution_id is not null order by placed_at desc limit 1");
      if (prev.length && bkey) {
        const r = await tfetch(`https://api.bolna.ai/executions/${prev[0].execution_id}`, { headers: { Authorization: `Bearer ${bkey}` } });
        const j = await r.json().catch(() => ({}));
        const st = String(j?.status || "");
        const dur = Number(j?.telephony_data?.duration ?? 0);
        // Reaching the carrier = up (ringing/answered/no-answer/busy/completed); a
        // failure to place ('error'/'failed') with no carrier contact = down.
        const reached = /ring|answer|complete|no-answer|busy|in-progress|disconnect/i.test(st) || dur > 0;
        const down = !reached && /error|fail/i.test(st);
        await sql(CRM_REF, `update voice_probe_log set verified=true, connected=${reached}, status=${qs(st)} where id=${qs(prev[0].id)}`);
        out.push({
          label: "API · Exotel Voice (test call)",
          status: down ? "fail" : "ok",
          detail: down ? `last hourly test call FAILED to reach the carrier (status=${st}) — voice line is DOWN` : `last test call reached the carrier (status=${st || "ok"})`,
        });
      }
    } catch (e) { out.push({ label: "API · Exotel Voice (test call)", status: "warn", detail: `verify failed: ${String(e).slice(0, 100)}` }); }
  }

  // 2) Place a fresh test call (live only). Bolna accepting it proves the API path;
  //    its connect outcome is checked next run (step 1).
  if (live && agent && bkey) {
    try {
      const r = await tfetch("https://api.bolna.ai/call", {
        method: "POST", headers: { Authorization: `Bearer ${bkey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agent, recipient_phone_number: OPS_WA, from_phone_number: "+911169323462", user_data: { purpose: "line-test" } }),
      });
      const j = await r.json().catch(() => ({}));
      const exId = j?.execution_id || null;
      const queued = r.status >= 200 && r.status < 300 && /queue|schedul/i.test(String(j?.status || ""));
      if (exId) await sql(CRM_REF, `insert into voice_probe_log(execution_id, placed_at) values(${qs(exId)}, now())`);
      out.push({
        label: "API · Bolna (call placement)",
        status: queued ? "ok" : "fail",
        detail: queued ? `test call queued (exec ${String(exId).slice(0, 8)})` : `Bolna refused the call: HTTP ${r.status} ${JSON.stringify(j).slice(0, 120)}`,
      });
    } catch (e) { out.push({ label: "API · Bolna (call placement)", status: "fail", detail: `place failed: ${String(e).slice(0, 120)}` }); }
  }

  // 3) Live organic connect-rate (catches an outage the SAME hour during calling
  //    windows — the immediate Jun-5 signature, no 1-hour lag).
  try {
    const rows = await sql("ejzjrvazegaxrhqizgaa", "select count(*) attempts, count(*) filter (where conversation_duration>0) connected from call_logs where caller_type='ai' and created_at > now() - interval '6 hours'");
    const a = Number(rows[0]?.attempts || 0), c = Number(rows[0]?.connected || 0);
    out.push({
      label: "API · Exotel Voice (live connect-rate)",
      status: a >= 20 && c === 0 ? "fail" : "ok",
      detail: a >= 20 && c === 0 ? `${a} AI calls in 6h, ZERO connected — voice line down` : a ? `${c}/${a} connected in 6h` : "no organic calls in window",
    });
  } catch { /* non-fatal */ }
  return out;
}

// All external providers the fleet depends on, each a real authenticated call.
async function checkExternalApis(live: boolean): Promise<{ ref: string; name: string; checks: Check[] }> {
  const checks: Check[] = [];
  checks.push(...(await probeVoice(live)));

  checks.push(await probe("API · Bolna", async () => {
    const k = E("BOLNA_API_KEY"); if (!k) return { ok: false, detail: "no BOLNA_API_KEY", skip: true };
    const r = await tfetch("https://api.bolna.ai/v2/agent/all", { headers: { Authorization: `Bearer ${k}` } });
    return { ok: r.status === 200, detail: r.status === 200 ? "agent list ok" : `HTTP ${r.status}` };
  }));

  checks.push(await probe("API · Exotel WhatsApp", async () => {
    const sid = E("EXOTEL_WA_SID"), key = E("EXOTEL_WA_API_KEY"), tok = E("EXOTEL_WA_API_TOKEN"), waba = E("EXOTEL_WABA");
    if (!sid || !key || !tok) return { ok: false, detail: "WA creds missing on crm", skip: true };
    const r = await tfetch(`https://${key}:${tok}@api.exotel.com/v2/accounts/${sid}/templates?waba_id=${waba}&limit=1`);
    return { ok: r.status === 200, detail: r.status === 200 ? "WhatsApp API ok" : `HTTP ${r.status}` };
  }));

  checks.push(await probe("API · Exotel Voice (account)", async () => {
    const sid = E("EXOTEL_SID"), key = E("EXOTEL_API_KEY"), tok = E("EXOTEL_API_TOKEN"), sub = E("EXOTEL_SUBDOMAIN") || "api.in.exotel.com";
    if (!sid || !key || !tok) return { ok: false, detail: "voice creds missing on crm", skip: true };
    const r = await tfetch(`https://${key}:${tok}@${sub}/v1/Accounts/${sid}/IncomingPhoneNumbers.json`);
    return { ok: r.status === 200, detail: r.status === 200 ? "voice account API ok" : `HTTP ${r.status}` };
  }));

  checks.push(await probe("API · Resend (email)", async () => {
    const k = E("RESEND_API_KEY"); if (!k) return { ok: false, detail: "no key", skip: true };
    const r = await tfetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${k}` } });
    return { ok: r.status === 200, detail: r.status === 200 ? "email API ok" : `HTTP ${r.status}` };
  }));

  checks.push(await probe("API · Razorpay", async () => {
    const id = E("RAZORPAY_KEY_ID"), sec = E("RAZORPAY_KEY_SECRET"); if (!id || !sec) return { ok: false, detail: "no keys", skip: true };
    const r = await tfetch("https://api.razorpay.com/v1/payments?count=1", { headers: { Authorization: `Basic ${btoa(id + ":" + sec)}` } });
    return { ok: r.status === 200, detail: r.status === 200 ? "payments API ok (read)" : `HTTP ${r.status}` };
  }));

  checks.push(await probe("API · Google Ads", async () => {
    const rt = E("GOOGLE_ADS_REFRESH_TOKEN"), dev = E("GOOGLE_ADS_DEVELOPER_TOKEN"); if (!rt || !dev) return { ok: false, detail: "no Ads creds", skip: true };
    const at = await googleAccess(rt); if (!at) return { ok: false, detail: "OAuth refresh failed (token revoked/expired)" };
    const r = await tfetch("https://googleads.googleapis.com/v21/customers/6785487693/googleAds:search", {
      method: "POST", headers: { Authorization: `Bearer ${at}`, "developer-token": dev, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "SELECT customer.id FROM customer LIMIT 1" }),
    });
    return { ok: r.status === 200, detail: r.status === 200 ? "Ads v21 query ok" : `HTTP ${r.status} — check API version / token (the v16→v21 retirement class)` };
  }));

  checks.push(await probe("API · YouTube", async () => {
    const rt = E("YOUTUBE_REFRESH_TOKEN"); if (!rt) return { ok: false, detail: "no YouTube token", skip: true };
    const at = await googleAccess(rt); if (!at) return { ok: false, detail: "OAuth refresh failed" };
    const r = await tfetch("https://www.googleapis.com/youtube/v3/channels?part=id&mine=true", { headers: { Authorization: `Bearer ${at}` } });
    return { ok: r.status === 200, detail: r.status === 200 ? "channel read ok" : `HTTP ${r.status}` };
  }));

  checks.push(await probe("API · GA4", async () => {
    const mid = E("GA4_MEASUREMENT_ID"), sec = E("GA4_API_SECRET"); if (!mid || !sec) return { ok: false, detail: "no GA4 creds", skip: true };
    const r = await tfetch(`https://www.google-analytics.com/debug/mp/collect?measurement_id=${mid}&api_secret=${sec}`, {
      method: "POST", body: JSON.stringify({ client_id: "sentinel.probe", events: [{ name: "sentinel_probe" }] }),
    });
    const j = await r.json().catch(() => ({}));
    const ok = r.status === 200 && Array.isArray(j?.validationMessages) && j.validationMessages.length === 0;
    return { ok, detail: ok ? "Measurement Protocol validation ok" : `HTTP ${r.status} ${JSON.stringify(j?.validationMessages || "").slice(0, 100)}` };
  }));

  checks.push(await probe("API · Gemini", async () => {
    const k = E("GEMINI_API_KEY"); if (!k) return { ok: false, detail: "no key", skip: true };
    const r = await tfetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${k}`);
    return { ok: r.status === 200, detail: r.status === 200 ? "models ok" : `HTTP ${r.status} (key may be restricted — known image-gen blocker)` };
  }));

  checks.push(await probe("API · ElevenLabs", async () => {
    const k = E("ELEVENLABS_API_KEY"); if (!k) return { ok: false, detail: "no key on crm (video pipeline; in work/.env)", skip: true };
    const r = await tfetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": k } });
    return { ok: r.status === 200, detail: r.status === 200 ? "ok" : `HTTP ${r.status}` };
  }));

  checks.push(await probe("API · Shotstack", async () => {
    const k = E("SHOTSTACK_API_KEY"); if (!k) return { ok: false, detail: "no key", skip: true };
    const r = await tfetch("https://api.shotstack.io/v1/templates", { headers: { "x-api-key": k } });
    return { ok: r.status === 200, detail: r.status === 200 ? "ok" : `HTTP ${r.status}` };
  }));

  checks.push(await probe("API · Pexels", async () => {
    const k = E("PEXELS_API_KEY"); if (!k) return { ok: false, detail: "no key", skip: true };
    const r = await tfetch("https://api.pexels.com/v1/search?query=office&per_page=1", { headers: { Authorization: k } });
    return { ok: r.status === 200, detail: r.status === 200 ? "ok" : `HTTP ${r.status}` };
  }));

  checks.push(await probe("API · Anthropic", async () => {
    const k = E("ANTHROPIC_API_KEY"); if (!k) return { ok: false, detail: "no key", skip: true };
    const r = await tfetch("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": k, "anthropic-version": "2023-06-01" } });
    return { ok: r.status === 200, detail: r.status === 200 ? "ok" : `HTTP ${r.status}` };
  }));

  checks.push(await probe("API · Groq", async () => {
    const k = E("GROQ_API_KEY"); if (!k) return { ok: false, detail: "no key", skip: true };
    const r = await tfetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${k}` } });
    return { ok: r.status === 200, detail: r.status === 200 ? "ok" : `HTTP ${r.status}` };
  }));

  checks.push(await probe("API · Cloudflare", async () => {
    const t = E("CLOUDFLARE_API_TOKEN"); if (!t) return { ok: false, detail: "no token", skip: true };
    const r = await tfetch("https://api.cloudflare.com/client/v4/user/tokens/verify", { headers: { Authorization: `Bearer ${t}` } });
    return { ok: r.status === 200, detail: r.status === 200 ? "token valid" : `HTTP ${r.status}` };
  }));

  checks.push(await probe("API · Surepass (KYC)", async () => {
    const t = E("SUREPASS_TOKEN"); if (!t) return { ok: false, detail: "no SUREPASS_TOKEN on crm (vendor-verification creds)", skip: true };
    const r = await tfetch("https://kyc-api.surepass.io/api/v1/user/get-balance", { headers: { Authorization: `Bearer ${t}` } });
    return { ok: r.status === 200, detail: r.status === 200 ? "balance read ok (no real KYC)" : `HTTP ${r.status}` };
  }));

  return { ref: "external", name: "External APIs", checks };
}

// --- frontend render probe ---------------------------------------------------
// The blind spot that let fieldsync go dark mid-demo: every other check asserts
// the DATABASE/backend heartbeat, but a blank-screen SPA has a perfectly healthy
// backend — it dies in the browser because the build shipped with blank VITE_*
// env (createClient throws → white screen for every visitor). The server still
// returns 200 with a valid HTML shell, so a dumb HTTP check sees "up". We catch
// it by asserting the project's Supabase ref is actually BAKED INTO the shipped
// JS bundle — its absence is the exact signature of that build-env-stripping.
//
// A real-browser User-Agent is mandatory: the Cloudflare managed-challenge 403s
// any non-"Mozilla" UA, so a bare fetch sees the challenge page, not the app.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

async function fetchT(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: ctl.signal,
      headers: { "User-Agent": BROWSER_UA, ...(init?.headers || {}) },
      redirect: "follow",
    });
  } finally { clearTimeout(t); }
}

async function checkFrontend(ref: string, web: string): Promise<Check> {
  const L = "Frontend render";
  try {
    const r = await fetchT(web, 15000, { headers: { Accept: "text/html" } });
    const html = await r.text();
    if (r.status !== 200) {
      // Still challenged even with a browser UA, or genuinely down. A challenge
      // page only affects bots, not real visitors — flag it amber, not red.
      const challenged = /just a moment|cf-browser-verification|challenge-platform|cf-chl/i.test(html);
      return challenged
        ? { label: L, status: "warn", detail: `${web} → HTTP ${r.status} (Cloudflare challenge; real visitors unaffected)` }
        : { label: L, status: "fail", detail: `${web} → HTTP ${r.status} — site not serving` };
    }

    // Find the app's OWN entry bundle (same-origin /assets/*.js), ignoring
    // third-party scripts (Razorpay, help-widget, analytics, service worker).
    const origin = new URL(web).origin;
    const srcs = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => m[1]);
    const own = srcs
      .map((s) => { try { return new URL(s, web).href; } catch { return ""; } })
      .filter((u) => u && new URL(u).origin === origin)
      .filter((u) => !/registerSW|help-widget|sw\.js$/i.test(u));
    const bundles = own.filter((u) => /\/assets\//.test(u)).length ? own.filter((u) => /\/assets\//.test(u)) : own;

    if (bundles.length === 0) {
      return { label: L, status: "fail", detail: `${web} served an HTML shell with no app bundle — blank screen for all users` };
    }

    // The ref (https://<ref>.supabase.co) is baked in only if VITE_SUPABASE_URL
    // was present at build time. Scan the bundles for it.
    let baked = false;
    for (const b of bundles.slice(0, 6)) {
      const jr = await fetchT(b, 20000);
      if (jr.status !== 200) continue;
      const js = await jr.text();
      if (js.includes(ref)) { baked = true; break; }
    }
    return baked
      ? { label: L, status: "ok", detail: `renders; DB config baked into bundle` }
      : {
        label: L,
        status: "fail",
        detail: `${web} shipped WITHOUT its database config (VITE_ env stripped at build) — blank screen for every visitor`,
      };
  } catch (e) {
    return { label: L, status: "warn", detail: `probe failed: ${String(e).slice(0, 120)}` };
  }
}

// --- module-wise checks ------------------------------------------------------
// Each app's user-facing modules mapped to the REAL data layer that backs them,
// so a broken migration / dropped column / dead view shows up as that specific
// module going red (instead of a vague "project up"). Probes are read-only.
//   table/view: assert it exists and the listed key columns are present
//   rpc: actually execute it (read-only) and assert it doesn't error
const GC_ORG = "61f7f96d-e80c-4d9b-a765-8eb32bd3c70d";
type ModSpec =
  | { m: string; table: string; cols?: string[] }
  | { m: string; view: string; cols?: string[] }
  | { m: string; rpc: string };
// Helper for existence-only module lists (no column assertions): [label, table][].
const tbl = (pairs: [string, string][]): ModSpec[] => pairs.map(([m, table]) => ({ m, table }));
const MODULE_MAP: Record<string, ModSpec[]> = {
  ejzjrvazegaxrhqizgaa: [ // globalcrm
    { m: "Dashboard", rpc: `get_dashboard_stats('${GC_ORG}'::uuid)` },
    { m: "Contacts", table: "contacts", cols: ["first_name", "email", "phone", "status", "pipeline_stage_id"] },
    { m: "Pipeline (disposition view)", view: "contact_latest_disposition" },
    { m: "Pipeline stages", table: "pipeline_stages", cols: ["name", "stage_order", "probability", "is_active"] },
    { m: "Clients", table: "clients", cols: ["first_name", "last_name", "email", "phone", "company"] },
    { m: "Calling", table: "call_logs", cols: ["agent_id", "status", "conversation_duration", "disposition_id"] },
    { m: "Call dispositions", table: "call_dispositions", cols: ["name", "category", "is_active"] },
    { m: "Templates (WhatsApp)", table: "communication_templates", cols: ["template_name", "template_type", "status"] },
    { m: "Templates (Email)", table: "email_templates", cols: ["is_active"] },
    { m: "Chat / Messages", table: "chat_conversations", cols: ["name", "conversation_type"] },
    { m: "Attendance", table: "attendance_records", cols: ["user_id", "date", "status", "sign_in_time"] },
    { m: "Leave", table: "leave_applications", cols: ["user_id", "leave_type", "start_date", "status", "total_days"] },
    { m: "Leave balances", table: "leave_balances" },
    { m: "HR approvals", table: "attendance_regularizations", cols: ["user_id", "status"] },
    { m: "Users", table: "user_roles", cols: ["role", "is_active", "org_id"] },
    { m: "Teams", table: "teams", cols: ["name", "manager_id"] },
    { m: "Designations", table: "designations", cols: ["name", "role", "is_active"] },
    { m: "Approval matrix", table: "approval_rules", cols: ["approval_type_id"] },
    { m: "Custom fields", table: "custom_fields", cols: ["field_name", "field_type", "field_order"] },
    { m: "Forms", table: "forms", cols: ["name", "is_active", "connector_type"] },
    { m: "Outbound webhooks", table: "outbound_webhooks", cols: ["name", "trigger_event", "webhook_url", "is_active"] },
    { m: "Calendar", table: "contact_activities", cols: ["activity_type", "scheduled_at"] },
    { m: "Billing", table: "organization_subscriptions", cols: ["subscription_status", "wallet_balance", "next_billing_date"] },
    { m: "Reports", rpc: `get_pipeline_performance_report('${GC_ORG}'::uuid)` },
  ],
  // The other products are NOT sales CRMs — each has its own modules. Maps below
  // are built from each project's REAL table inventory (existence-probed; exact
  // names, so no false reds — a red here means a table genuinely vanished).
  rdhvkluvkieajtmpljyz: tbl([ // work (Work-Sync — task mgmt)
    ["Tasks", "tasks"], ["Task milestones", "task_milestones"], ["Task comments", "task_comments"],
    ["Task attachments", "task_attachments"], ["Task watchers", "task_watchers"], ["Support tickets", "support_tickets"],
    ["Payments", "payments"], ["Teams", "teams"], ["Team members", "team_members"], ["Designations", "designations"],
    ["Feature permissions", "feature_permissions"], ["Reporting hierarchy", "reporting_hierarchy"],
    ["Notifications", "notifications"], ["Users", "profiles"], ["Roles", "user_roles"],
  ]),
  jmxpudhpdltktuupfbxs: tbl([ // fieldsync (field service)
    ["Leads", "leads"], ["Lead activities", "lead_activities"], ["Customers", "customers"], ["Visits", "visits"],
    ["Visit photos", "visit_photos"], ["Daily plans", "daily_plans"], ["Plan enrollments", "plan_enrollments"],
    ["Order collections", "order_collections"], ["Invoices", "invoices"], ["Payments", "payment_transactions"],
    ["Dispositions", "dispositions"], ["Sub-dispositions", "sub_dispositions"], ["Branches", "branches"],
    ["Agent locations", "agent_locations"], ["Travel reimbursements", "travel_reimbursements"],
    ["Incentive targets", "monthly_incentive_targets"], ["Attendance", "attendance"], ["Subscription plans", "subscription_plans"],
    ["Form templates", "form_templates"], ["Visit checklists", "visit_checklist_templates"], ["Routes", "route_deviations"],
    ["Users", "profiles"], ["Roles", "user_roles"],
  ]),
  gwfofzqrfpwojejjodgz: tbl([ // event (event mgmt)
    ["Events", "events"], ["Sessions", "sessions"], ["Session speakers", "session_speakers"], ["Speakers", "speakers"],
    ["Registrations", "registrations"], ["Attendee schedules", "attendee_schedules"], ["Check-ins", "check_ins"],
    ["Invitations", "invitations"], ["Badges", "badges"], ["Badge awards", "badge_awards"], ["Certificates", "certificates"],
    ["Certificate templates", "certificate_templates"], ["Rewards", "rewards"], ["Reward claims", "reward_claims"],
    ["Meeting bookings", "meeting_bookings"], ["Meeting requests", "meeting_requests"], ["Meeting slots", "meeting_slots"],
    ["Sponsors", "sponsors"], ["Content library", "content_library"], ["Landing pages", "landing_pages"],
    ["Engagement scores", "engagement_scores"], ["Billing accounts", "billing_accounts"], ["Users", "profiles"], ["Roles", "user_roles"],
  ]),
  hmqwmmlqfrrktfsiowdh: tbl([ // expense
    ["Expense claims", "travel_expense_claims"], ["Expense items", "travel_expense_items"], ["Teams", "teams"],
    ["Team members", "team_members"], ["Org memberships", "org_memberships"], ["Users", "profiles"], ["Roles", "user_roles"],
  ]),
  fibpamjksquymscdlfal: tbl([ // vendorverification (vendor empanelment)
    ["Vendors", "vendors"], ["Vendor documents", "vendor_documents"], ["Verifications", "vendor_verifications"],
    ["Vendor users", "vendor_users"], ["Vendor invitations", "vendor_invitations"], ["Categories", "vendor_categories"],
    ["Category documents", "category_documents"], ["Document types", "document_types"], ["Document analyses", "document_analyses"],
    ["Consent records", "consent_records"], ["Data requests", "data_requests"], ["Fraud alerts", "fraud_alerts"],
    ["Breach notifications", "breach_notifications"], ["Coupons", "coupons"], ["Subscriptions", "org_subscriptions"],
    ["Billing", "billing_transactions"], ["WhatsApp", "whatsapp_messages"], ["WhatsApp templates", "whatsapp_templates"],
    ["Webhooks", "webhook_endpoints"], ["Workflows", "workflow_assignments"], ["Tenants", "tenants"],
    ["Users", "profiles"], ["Roles", "user_roles"],
  ]),
  zcmfxpknsybponbudyqb: tbl([ // smbconnect
    ["Companies", "companies"], ["Members", "members"], ["Associations", "associations"],
    ["Association managers", "association_managers"], ["Connections", "connections"], ["Posts", "posts"],
    ["Post comments", "post_comments"], ["Events", "events"], ["Event registrations", "event_registrations"],
    ["Event coupons", "event_coupons"], ["Email campaigns", "email_campaigns"], ["Email lists", "email_lists"],
    ["Email templates", "email_templates"], ["Email conversations", "email_conversations"], ["WhatsApp", "whatsapp_messages"],
    ["WhatsApp lists", "whatsapp_lists"], ["WhatsApp templates", "whatsapp_templates"], ["Chats", "chats"],
    ["Messages", "messages"], ["Member invitations", "member_invitations"], ["Certifications", "certifications"],
    ["Skills", "skills"], ["Key functionaries", "key_functionaries"], ["Analytics events", "analytics_events"],
    ["Admin users", "admin_users"], ["Company admins", "company_admins"], ["Users", "profiles"],
  ]),
  htdwkhtfdifwajdkkpul: tbl([ // ats (applicant tracking)
    ["Candidates", "candidates"], ["Candidate resumes", "candidate_resumes"], ["Jobs", "jobs"], ["Mandates", "mandates"],
    ["Mandate candidates", "mandate_candidates"], ["Clients", "clients"], ["Pipeline stages", "pipeline_stages"],
    ["Call logs", "call_logs"], ["Call dispositions", "call_dispositions"], ["Sites", "sites"],
    ["Site coordinators", "site_coordinators"], ["Site headcount", "site_headcount_agreements"], ["General tasks", "general_tasks"],
    ["Public applications", "public_job_applications"], ["Email templates", "email_templates"], ["SMS templates", "sms_templates"],
    ["WhatsApp templates", "whatsapp_templates"], ["Teams", "teams"], ["Designations", "designations"],
    ["Webhook connectors", "webhook_connectors"], ["Bulk import", "bulk_import_history"], ["Project teams", "project_team_members"],
    ["Users", "profiles"], ["Roles", "user_roles"],
  ]),
  upnhhrhobvdmpfnldvgb: tbl([ // website (core marketing site)
    ["Blogs", "blogs"], ["Contacts", "contacts"], ["Demo requests", "demo_requests"], ["Events", "events"],
    ["Tickets", "tickets"], ["Support tickets", "support_tickets"], ["Tutorials", "tutorials"], ["Whitepapers", "whitepapers"],
    ["Onboarding applications", "onboarding_applications"], ["Unanswered queries", "unanswered_queries"],
    ["Chat logs", "chat_logs"], ["Users", "profiles"], ["Roles", "user_roles"],
  ]),
};

// Canonical module catalog for the sibling CRM apps that don't have a hand-built
// MODULE_MAP. Each module lists candidate relation names (to absorb name drift
// across apps) and/or candidate RPC names. At runtime we probe ONLY the modules
// whose table/view/function actually exists in that project — so it auto-fits
// every app and never cries wolf about a module an app simply doesn't have.
type CanonMod = { m: string; rels?: string[]; rpcs?: string[] };
const CANONICAL: CanonMod[] = [
  { m: "Dashboard", rpcs: ["get_dashboard_stats"] },
  { m: "Contacts / Leads", rels: ["contacts", "leads"] },
  { m: "Pipeline stages", rels: ["pipeline_stages", "stages"] },
  { m: "Pipeline (disposition view)", rels: ["contact_latest_disposition"] },
  { m: "Clients", rels: ["clients"] },
  { m: "Calling", rels: ["call_logs", "calls"] },
  { m: "Call dispositions", rels: ["call_dispositions", "dispositions"] },
  { m: "WhatsApp", rels: ["whatsapp_messages", "whatsapp_logs"] },
  { m: "Email", rels: ["email_conversations", "emails", "email_logs"] },
  { m: "Chat", rels: ["chat_conversations", "conversations"] },
  { m: "Templates", rels: ["communication_templates", "whatsapp_templates", "email_templates", "templates"] },
  { m: "Notes", rels: ["notes", "contact_notes"] },
  { m: "Tasks / Activities", rels: ["contact_activities", "activities", "tasks"] },
  { m: "Calendar / Meetings", rels: ["meetings", "calendar_events", "company_holidays"] },
  { m: "Attendance", rels: ["attendance_records", "attendance"] },
  { m: "Leave", rels: ["leave_applications", "leave_requests", "leaves"] },
  { m: "HR approvals", rels: ["attendance_regularizations", "hr_approvals", "approvals"] },
  { m: "Users", rels: ["profiles"] },
  { m: "Roles", rels: ["user_roles"] },
  { m: "Teams", rels: ["teams"] },
  { m: "Designations", rels: ["designations"] },
  { m: "Custom fields", rels: ["custom_fields"] },
  { m: "Forms", rels: ["forms"] },
  { m: "Outbound webhooks", rels: ["outbound_webhooks", "webhooks"] },
  { m: "Billing / Subscriptions", rels: ["organization_subscriptions", "subscriptions"] },
];

async function checkCanonicalModules(ref: string): Promise<Check[]> {
  let relRows: any[], fnRows: any[];
  try {
    relRows = await sql(
      ref,
      "select table_name, table_type from information_schema.tables where table_schema='public'",
    );
    fnRows = await sql(ref, "select distinct proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'");
  } catch (e) {
    return [{ label: "Modules", status: "warn", detail: `schema read failed: ${e}` }];
  }
  const relType: Record<string, string> = {};
  for (const r of relRows) relType[r.table_name] = r.table_type; // 'BASE TABLE' | 'VIEW'
  const fns = new Set(fnRows.map((r) => r.proname));

  const out: Check[] = [];
  for (const c of CANONICAL) {
    const rel = (c.rels || []).find((r) => r in relType);
    const fn = (c.rpcs || []).find((f) => fns.has(f));
    if (!rel && !fn) continue; // module not present in this app — skip, don't flag
    if (rel && relType[rel] === "VIEW") {
      // Views can exist in the catalog but break at runtime — actually select.
      try {
        await sql(ref, `select 1 from "${rel}" limit 1`);
        out.push({ label: `Module · ${c.m}`, status: "ok", detail: `${rel} (view) ok` });
      } catch (e) {
        out.push({ label: `Module · ${c.m}`, status: "fail", detail: `view "${rel}" broken: ${String(e).slice(0, 100)}` });
      }
    } else {
      out.push({ label: `Module · ${c.m}`, status: "ok", detail: rel ? `${rel} present` : `rpc ${fn} present` });
    }
  }
  return out;
}

async function checkModules(ref: string): Promise<Check[]> {
  const specs = MODULE_MAP[ref];
  if (!specs) return await checkCanonicalModules(ref); // sibling apps: self-adapting catalog
  const out: Check[] = [];

  // One round-trip: pull every relevant table/view column from the catalog.
  const rels = [...new Set(specs.flatMap((s) => ("table" in s ? [s.table] : "view" in s ? [s.view] : [])))];
  const present: Record<string, Set<string>> = {};
  if (rels.length) {
    try {
      const rows = await sql(
        ref,
        `select table_name, column_name from information_schema.columns where table_schema='public' and table_name in (${rels.map((r) => `'${r}'`).join(",")})`,
      );
      for (const r of rows) (present[r.table_name] ??= new Set()).add(r.column_name);
    } catch (e) {
      return [{ label: "Modules", status: "warn", detail: `catalog read failed: ${e}` }];
    }
  }

  for (const s of specs) {
    if ("rpc" in s) {
      try {
        await sql(ref, `select ${s.rpc}`);
        out.push({ label: `Module · ${s.m}`, status: "ok", detail: "function executes" });
      } catch (e) {
        out.push({ label: `Module · ${s.m}`, status: "fail", detail: `RPC broken: ${String(e).slice(0, 120)}` });
      }
      continue;
    }
    const rel = "table" in s ? s.table : s.view;
    const cols = present[rel];
    if (!cols || cols.size === 0) {
      out.push({ label: `Module · ${s.m}`, status: "fail", detail: `${"view" in s ? "view" : "table"} "${rel}" missing` });
      continue;
    }
    const missing = (s.cols || []).filter((c) => !cols.has(c));
    out.push(
      missing.length
        ? { label: `Module · ${s.m}`, status: "fail", detail: `"${rel}" missing column(s): ${missing.join(", ")}` }
        : { label: `Module · ${s.m}`, status: "ok", detail: `${rel} ok` },
    );
  }
  return out;
}

async function runProject(ref: string): Promise<{ ref: string; name: string; checks: Check[] }> {
  const m = META[ref] ?? { name: ref };
  const checks: Check[] = [];
  checks.push(await checkDb(ref));
  // The frontend probe is independent of DB health — a blank-screen SPA HAS a
  // healthy DB — so it always runs. undefined web = coverage gap, flag it amber
  // (never silent); null = intentional backend-only opt-out.
  if (m.web) checks.push(await checkFrontend(ref, m.web));
  else if (m.web === undefined) {
    checks.push({ label: "Frontend render", status: "warn", detail: "not monitored — add a web URL to Sentinel META (frontend blind spot)" });
  }
  // Skip the heavy DB checks if the DB itself is down.
  if (checks[0].status !== "fail") {
    checks.push(await checkRegistration(ref));
    checks.push(await checkRlsExposure(ref));
    if (m.dialer) checks.push(...(await checkDialer(ref)));
    if (m.marketing) checks.push(await checkMarketing(ref));
    checks.push(...(await checkModules(ref)));
  }
  return { ref, name: m.name, checks };
}

// --- report ------------------------------------------------------------------

function dot(s: Status) { return s === "ok" ? "🟢" : s === "warn" ? "🟡" : "🔴"; }

function buildEmail(results: { ref: string; name: string; checks: Check[] }[], istDate: string) {
  const reds = results.flatMap((r) => r.checks.filter((c) => c.status === "fail").map((c) => ({ p: r.name, c })));
  const ambers = results.flatMap((r) => r.checks.filter((c) => c.status === "warn").map((c) => ({ p: r.name, c })));
  const allGreen = reds.length === 0 && ambers.length === 0;
  const subject = reds.length
    ? `🔴 Health Sentinel — ${reds.length} issue(s) need attention (${istDate})`
    : ambers.length
    ? `🟡 Health Sentinel — ${ambers.length} thing(s) to watch (${istDate})`
    : `🟢 Health Sentinel — all clear (${istDate})`;

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let html = `<div style="font-family:system-ui,Arial,sans-serif;font-size:14px;color:#111">`;
  html += `<h2 style="margin:0 0 4px">${subject}</h2>`;
  html += `<p style="color:#666;margin:0 0 16px">Daily fleet pre-flight across ${results.length} projects.</p>`;

  if (reds.length) {
    html += `<h3 style="color:#b91c1c">🔴 Broken — fix today</h3><ul>`;
    for (const { p, c } of reds) html += `<li><b>${esc(p)}</b> — ${esc(c.label)}: ${esc(c.detail)}</li>`;
    html += `</ul>`;
  }
  if (ambers.length) {
    html += `<h3 style="color:#b45309">🟡 Watch</h3><ul>`;
    for (const { p, c } of ambers) html += `<li><b>${esc(p)}</b> — ${esc(c.label)}: ${esc(c.detail)}</li>`;
    html += `</ul>`;
  }
  if (allGreen) html += `<p style="color:#15803d;font-weight:600">✅ Every check passed on every project.</p>`;

  html += `<h3 style="margin-top:20px">Full checklist</h3><table style="border-collapse:collapse;width:100%">`;
  for (const r of results) {
    html += `<tr><td colspan="2" style="padding:10px 6px 2px;font-weight:700;border-top:1px solid #eee">${esc(r.name)}</td></tr>`;
    for (const c of r.checks) {
      html += `<tr><td style="padding:2px 6px;white-space:nowrap">${dot(c.status)} ${esc(c.label)}</td><td style="padding:2px 6px;color:#555">${esc(c.detail)}</td></tr>`;
    }
  }
  html += `</table></div>`;
  return { subject, html };
}

async function sendEmail(subject: string, html: string) {
  // The Resend account is shared with the crm marketing engine, so a momentary
  // per-second 429 is expected; retry with backoff so the daily report never
  // silently drops (the watchman must not go silent — the whole point).
  const body = JSON.stringify({ from: FROM, to: [OPS_EMAIL], subject, html });
  let last = { s: 0, t: "" };
  for (let i = 0; i < 4; i++) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body,
    });
    last = { s: r.status, t: await r.text() };
    if (r.status !== 429) break;
    await new Promise((res) => setTimeout(res, 1200 * (i + 1)));
  }
  return last;
}

// =================== CLOSED LOOP: auto-fix + incidents + escalation ==========
const CRM_REF = "mlvgqudcwlkolsbighnn";
const OPS_WA = "+917738919680";
const ACK_BASE = `https://${CRM_REF}.supabase.co/functions/v1/sentinel-ack`;
const qs = (s: any) => "'" + String(s ?? "").replace(/'/g, "''") + "'"; // SQL literal
const ist = (s: string) =>
  new Date(s).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const mins = (from: string) => Math.max(1, Math.round((Date.now() - new Date(from).getTime()) / 60000));

// Stamp the Sentinel's own pulse so sentinel-tripwire can alarm on its absence.
// Best-effort: a heartbeat write failing must never break the run, but it WILL
// (correctly) let the tripwire fire — silence is exactly what it watches for.
async function heartbeat(kind: "watch" | "digest", detail: Record<string, unknown>) {
  try {
    await sql(CRM_REF, `insert into sentinel_heartbeat(kind,last_ok_at,detail,updated_at) values(${qs(kind)},now(),${qs(JSON.stringify(detail))}::jsonb,now()) on conflict (kind) do update set last_ok_at=now(), detail=excluded.detail, updated_at=now()`);
  } catch (_) { /* tripwire will catch the resulting staleness */ }
}

// AUTO-FIX REGISTRY — keyed by check label. Only SAFE, idempotent restorations
// of a known-good state ("set it right"), never anything that builds/migrates.
const AUTO_FIXERS: Record<string, (ref: string) => Promise<{ fixed: boolean; note: string }>> = {
  "Registration email": async (ref) => {
    const body = {
      smtp_admin_email: "notifications@in-sync.co.in", smtp_host: "smtp.resend.com", smtp_port: "587",
      smtp_user: "resend", smtp_pass: Deno.env.get("RESEND_API_KEY"), smtp_sender_name: "In-Sync",
      smtp_max_frequency: 1, rate_limit_email_sent: 100,
    };
    const r = await fetch(`${MGMT}/v1/projects/${ref}/config/auth`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return { fixed: r.status === 200, note: r.status === 200 ? "re-pointed signup email to Resend @100/hr" : `patch failed (${r.status})` };
  },
};

// --- escalation channels (email live; WhatsApp + AI call gated until wired) ---
// kind "issue" → red alert template WITH an Acknowledge button (HEALTH_WA_TEMPLATE_ISSUE,
// e.g. sentinel_issue_v2); kind "resolved" → green resolved template, no button
// (HEALTH_WA_TEMPLATE_RESOLVED). Both fall back to the plain HEALTH_WA_TEMPLATE until
// the designed templates are Meta-approved, so alerting never breaks during approval.
// The button param is the per-incident ack token (button-0 url suffix) → tap lands on
// the two-step confirm page and the ack is RECORDED.
async function notifyWhatsApp(text: string, opts: { kind?: "issue" | "resolved"; ackToken?: string } = {}): Promise<string> {
  const isResolved = opts.kind === "resolved";
  const issueTpl = Deno.env.get("HEALTH_WA_TEMPLATE_ISSUE");
  const resolvedTpl = Deno.env.get("HEALTH_WA_TEMPLATE_RESOLVED");
  const fallback = Deno.env.get("HEALTH_WA_TEMPLATE");
  const tpl = (isResolved ? resolvedTpl : issueTpl) || fallback;
  if (!tpl) return "wa skipped (no approved template yet)";
  // MUST use the WA-flavoured creds (SID without trailing 'm'); the bare EXOTEL_*
  // pair is VOICE and 401s on the WhatsApp API. See exotel-voice-vs-wa-creds.
  const sid = Deno.env.get("EXOTEL_WA_SID"), key = Deno.env.get("EXOTEL_WA_API_KEY"), tok = Deno.env.get("EXOTEL_WA_API_TOKEN");
  const from = Deno.env.get("EXOTEL_SENDER_NUMBER");
  if (!sid || !key || !tok || !from) return "wa skipped (WA creds missing)";
  const components: any[] = [{ type: "body", parameters: [{ type: "text", text: text.slice(0, 600) }] }];
  // Only the button-bearing issue template takes the ack-token button param.
  if (!isResolved && opts.ackToken && issueTpl && tpl === issueTpl) {
    components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: opts.ackToken }] });
  }
  try {
    const r = await fetch(`https://${key}:${tok}@api.exotel.com/v2/accounts/${sid}/messages?waba_id=${Deno.env.get("EXOTEL_WABA")}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ custom_data: "sentinel", whatsapp: { messages: [{ from, to: OPS_WA, content: { type: "template", template: { name: tpl, language: { code: "en" }, components } } } ] } }),
    });
    return `wa ${r.status}`;
  } catch (e) { return `wa err ${e}`; }
}

async function notifyAiCall(text: string, ackToken: string): Promise<string> {
  const agent = Deno.env.get("HEALTH_BOLNA_AGENT");
  if (!agent) return "call skipped (no ops agent yet)";
  try {
    const r = await fetch("https://api.bolna.ai/call", {
      method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("BOLNA_API_KEY")}`, "Content-Type": "application/json" },
      // ack_token round-trips as context_details so the call webhook can mark this
      // exact incident acknowledged when the operator picks up and says "NOTED".
      body: JSON.stringify({ agent_id: agent, recipient_phone_number: OPS_WA, from_phone_number: "+911169323462", user_data: { alert: text.slice(0, 400), ack_token: ackToken } }),
    });
    return `call ${r.status}`;
  } catch (e) { return `call err ${e}`; }
}

// Reconcile current check results against stored incidents: auto-fix, open/resolve
// (with outage windows), and escalate open un-fixable incidents until acknowledged.
async function reconcile(results: { ref: string; name: string; checks: Check[] }[]) {
  const open = await sql(CRM_REF, "select id, project, system, first_failed_at, correctable, acknowledged_at, escalation_count, ack_token from sentinel_incidents where status='open'");
  const openByKey = new Map(open.map((r) => [`${r.project}||${r.system}`, r]));

  const autoFixed: { project: string; system: string; detail: string; note: string }[] = [];
  const failing: { project: string; system: string; detail: string; correctable: boolean }[] = [];

  for (const r of results) {
    for (const c of r.checks) {
      if (c.status !== "fail") continue;
      const fixer = AUTO_FIXERS[c.label];
      if (fixer) {
        const res = await fixer(r.ref).catch((e) => ({ fixed: false, note: String(e) }));
        if (res.fixed) { autoFixed.push({ project: r.name, system: c.label, detail: c.detail, note: res.note }); continue; }
        failing.push({ project: r.name, system: c.label, detail: `${c.detail} (auto-fix failed: ${res.note})`, correctable: true });
      } else {
        failing.push({ project: r.name, system: c.label, detail: c.detail, correctable: false });
      }
    }
  }

  const failKeys = new Set(failing.map((f) => `${f.project}||${f.system}`));
  const restored: any[] = [], autoMsgs: any[] = [], openMsgs: any[] = [];

  // Resolve incidents whose system recovered (human fix, or auto-fixed this run).
  for (const [key, row] of openByKey) {
    if (failKeys.has(key)) continue;
    const af = autoFixed.find((a) => `${a.project}||${a.system}` === key);
    await sql(CRM_REF, `update sentinel_incidents set status='resolved', resolved_at=now(), auto_fixed=${af ? "true" : "false"}, fix_note=${qs(af ? af.note : "recovered")}, updated_at=now() where id=${qs(row.id)}`);
    restored.push({ project: row.project, system: row.system, from: row.first_failed_at, auto: !!af, note: af?.note });
  }
  // Open or refresh incidents for things still failing; escalate the un-fixable.
  for (const f of failing) {
    const key = `${f.project}||${f.system}`;
    const ex = openByKey.get(key);
    let inc = ex;
    if (ex) {
      await sql(CRM_REF, `update sentinel_incidents set last_seen_at=now(), detail=${qs(f.detail)}, correctable=${f.correctable}, updated_at=now() where id=${qs(ex.id)}`);
    } else {
      const ins = await sql(CRM_REF, `insert into sentinel_incidents(project,system,detail,correctable) values(${qs(f.project)},${qs(f.system)},${qs(f.detail)},${f.correctable}) returning id, ack_token, first_failed_at, escalation_count, acknowledged_at`);
      inc = { ...ins[0], project: f.project, system: f.system };
    }
    if (!f.correctable && inc && !inc.acknowledged_at) {
      const ackUrl = `${ACK_BASE}?token=${inc.ack_token}&via=email`;
      const line = `${f.system} on ${f.project} is DOWN since ${ist(inc.first_failed_at)} IST (${mins(inc.first_failed_at)} min) — ${f.detail}. Needs a fix.`;
      await sendEmail(`🔴 ACTION NEEDED — ${f.system} on ${f.project} down`,
        `<div style="font-family:system-ui,Arial;font-size:15px"><p style="color:#b91c1c;font-weight:700">${line}</p><p><a href="${ackUrl}" style="background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">✔ I'm on it — acknowledge</a></p><p style="color:#777;font-size:12px">You'll keep getting these (and an AI call) until you acknowledge or it's restored.</p></div>`);
      await notifyWhatsApp(line, { kind: "issue", ackToken: inc.ack_token });
      if ((inc.escalation_count ?? 0) >= 1) await notifyAiCall(line + ` Say NOTED to acknowledge.`, inc.ack_token); // escalate to a call from the 2nd cycle
      await sql(CRM_REF, `update sentinel_incidents set escalation_count=escalation_count+1, escalated_email_at=now(), updated_at=now() where id=${qs(inc.id)}`);
      openMsgs.push({ project: f.project, system: f.system, since: inc.first_failed_at, detail: f.detail });
    }
  }
  // Same-run auto-fixes with no prior incident → audit row + "auto-corrected" note.
  for (const a of autoFixed) {
    if (openByKey.has(`${a.project}||${a.system}`)) continue;
    await sql(CRM_REF, `insert into sentinel_incidents(project,system,detail,correctable,auto_fixed,status,resolved_at,fix_note) values(${qs(a.project)},${qs(a.system)},${qs(a.detail)},true,true,'resolved',now(),${qs(a.note)})`);
    autoMsgs.push(a);
  }
  return { restored, autoMsgs, openMsgs };
}

Deno.serve(async (req) => {
  try {
    if (!token()) return new Response(JSON.stringify({ error: "MGMT_TOKEN not set" }), { status: 500 });

    // Discover the live project list (so new projects are covered automatically).
    const { s, j } = await mgmtGet("/v1/projects");
    if (s !== 200 || !Array.isArray(j)) {
      return new Response(JSON.stringify({ error: `project list failed (${s})` }), { status: 502 });
    }
    const refs: string[] = j.filter((p: any) => p.status !== "INACTIVE").map((p: any) => p.id);

    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry") === "1";

    const results = [];
    for (const ref of refs) results.push(await runProject(ref));
    // Every external API the fleet runs on, probed with a real authenticated call
    // each run (the Exotel-voice blind spot from 2026-06-05). Outward test call +
    // DB writes only happen on a live (non-dry) run.
    results.push(await checkExternalApis(!dryRun));
    // Stable, friendly ordering.
    results.sort((a, b) => a.name.localeCompare(b.name));

    const istDate = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
    let reqBody: any = {};
    try { reqBody = await req.json(); } catch { /* no body */ }
    const digest = url.searchParams.get("digest") === "1" || reqBody?.digest === true;

    // Closed loop: auto-fix correctable drift, open/resolve incidents with outage
    // windows, escalate the un-fixable until acknowledged. (Read-only on dry run.)
    let loop: any = { restored: [], autoMsgs: [], openMsgs: [] };
    if (!dryRun) {
      loop = await reconcile(results);
      // "Restored" notices — closes the loop for both auto-healed and human-fixed.
      for (const r of loop.restored) {
        const line = `${r.system} on ${r.project} failed ${ist(r.from)} IST → now (${mins(r.from)} min) and is ${r.auto ? "AUTO-corrected" : "restored"}${r.note ? ": " + r.note : ""}.`;
        await sendEmail(`✅ RESTORED — ${r.system} on ${r.project}`, `<p style="font-family:system-ui,Arial;color:#15803d;font-weight:600;font-size:15px">${line}</p>`);
        await notifyWhatsApp(line, { kind: "resolved" });
      }
      // Same-run auto-corrections (drift caught and put right before it bit you).
      for (const a of loop.autoMsgs) {
        const line = `🔧 ${a.system} on ${a.project} had drifted (${a.detail}) — auto-corrected: ${a.note}.`;
        await sendEmail(`🔧 AUTO-FIXED — ${a.system} on ${a.project}`, `<p style="font-family:system-ui,Arial;color:#1d4ed8;font-size:15px">${line}</p>`);
      }
    }

    // Full per-module digest only on the daily run (hourly runs just reconcile/escalate).
    let emailStatus = "hourly watch (no digest)";
    if (digest && !dryRun) {
      const { subject, html } = buildEmail(results, istDate);
      const e = await sendEmail(subject, html);
      emailStatus = `digest resend ${e.s}`;
      // Self-heartbeat: only stamp when the digest email ACTUALLY sent (2xx), so
      // sentinel-tripwire can alarm if the morning report ever goes missing again.
      if (e.s >= 200 && e.s < 300) {
        const reds = results.reduce((a, r) => a + r.checks.filter((c) => c.status === "fail").length, 0);
        const ambers = results.reduce((a, r) => a + r.checks.filter((c) => c.status === "warn").length, 0);
        await heartbeat("digest", { resend: e.s, projects: results.length, reds, ambers });
      }
    }

    // Watch heartbeat: the function reached end-to-end this run. This is the
    // pulse that goes stale fastest if the whole Sentinel is dead (e.g. a 401'd
    // invoker means we never get here at all), so the tripwire catches it soonest.
    if (!dryRun) await heartbeat("watch", { mode: digest ? "digest" : "watch" });

    const summary = results.map((r) => ({
      project: r.name,
      red: r.checks.filter((c) => c.status === "fail").length,
      amber: r.checks.filter((c) => c.status === "warn").length,
    }));
    const verbose = url.searchParams.get("verbose");
    const body: any = {
      ok: true, mode: digest ? "daily-digest" : dryRun ? "dry" : "hourly-watch", email: emailStatus,
      loop: { auto_fixed: loop.autoMsgs.length, restored: loop.restored.length, escalated_open: loop.openMsgs.length }, summary,
    };
    if (dryRun || verbose) {
      const want = verbose && verbose !== "1" ? verbose : null;
      body.detail = results
        .filter((r) => !want || r.name.includes(want))
        .map((r) => ({ project: r.name, checks: r.checks.map((c) => `${c.status === "ok" ? "OK" : c.status === "warn" ? "WARN" : "FAIL"} ${c.label}${c.status === "ok" ? "" : " — " + c.detail}`) }));
    }
    return new Response(JSON.stringify(body, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
