// Sync mkt_whatsapp_templates.body + buttons from the AUTHORITATIVE Meta-
// registered definitions (via Exotel). The DB drifted out of sync (e.g. DB
// ats_welcome had 2 body placeholders, Meta has 1), causing
// EX_TEMPLATE_PARAM_ERROR. After this sync, the send code's body-derived param
// count matches Meta exactly.
//   node sync-wa-templates-from-meta.mjs            (apply)
//   node sync-wa-templates-from-meta.mjs --dry-run  (report only)
import fs from "node:fs";
const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean)
    .map((m) => [m[1], m[2]])
);
const REF = env.SUPABASE_PROJECT_REF, TOKEN = env.SUPABASE_ACCESS_TOKEN;
const SUPA = env.SUPABASE_URL, SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const dry = process.argv.includes("--dry-run");

async function sql(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }) });
  return JSON.parse(await r.text());
}
const phCount = (s) => { const a = [...(s || "").matchAll(/\{\{(\d+)\}\}/g)].map((m) => +m[1]); return a.length ? Math.max(...a) : 0; };

// All Exotel WA settings (could be multiple orgs)
const settings = await sql(`SELECT org_id, api_key, api_token, subdomain, account_sid, waba_id
  FROM exotel_settings WHERE is_active AND whatsapp_enabled;`);

// Current DB templates
const dbRows = await sql(`SELECT id, template_name, org_id, body, buttons FROM mkt_whatsapp_templates;`);
const dbByKey = new Map(dbRows.map((r) => [`${r.org_id}::${r.template_name}`, r]));

let checked = 0, changed = 0, countFixed = 0;
const examples = [];

for (const st of settings) {
  const url = `https://${st.subdomain}/v2/accounts/${st.account_sid}/templates?waba_id=${st.waba_id}&limit=400`;
  const r = await fetch(url, { headers: { Authorization: `Basic ${Buffer.from(`${st.api_key}:${st.api_token}`).toString("base64")}` } });
  const j = JSON.parse(await r.text());
  const templates = j?.response?.whatsapp?.templates || [];

  for (const w of templates) {
    const t = w.data; if (!t?.name) continue;
    const row = dbByKey.get(`${st.org_id}::${t.name}`);
    if (!row) continue;
    checked++;

    const comps = t.components || t.containers || [];
    const bodyComp = comps.find((c) => /BODY/i.test(c.type));
    const btnComp  = comps.find((c) => /BUTTON/i.test(c.type));
    if (!bodyComp) continue;
    const metaBody = bodyComp.text || "";
    const metaButtons = btnComp ? (btnComp.buttons || []) : [];

    const oldCount = phCount(row.body), newCount = phCount(metaBody);
    const bodyDiff = (row.body || "").trim() !== metaBody.trim();
    const btnDiff  = JSON.stringify(row.buttons || []) !== JSON.stringify(metaButtons);
    if (!bodyDiff && !btnDiff) continue;

    changed++;
    if (oldCount !== newCount) { countFixed++; examples.push(`${t.name}: ${oldCount}→${newCount} params`); }

    if (!dry) {
      const resp = await fetch(`${SUPA}/rest/v1/mkt_whatsapp_templates?id=eq.${row.id}`, {
        method: "PATCH",
        headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ body: metaBody, buttons: metaButtons }),
      });
      if (!resp.ok) console.log(`  PATCH failed ${t.name}: ${resp.status} ${await resp.text()}`);
    }
  }
}

console.log(`${dry ? "[DRY RUN] " : ""}Matched ${checked} templates; ${changed} differed from Meta; ${countFixed} had a param-count change.`);
examples.slice(0, 30).forEach((e) => console.log("  " + e));
