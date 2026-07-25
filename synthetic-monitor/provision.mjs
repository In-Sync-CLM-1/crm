// Provision the dedicated read-only "Sentinel Monitor" account across the fleet.
//
// Idempotent: creates (or password-resets) the monitor auth user in each project
// via the GoTrue admin API (new secret key), then grants it a high-visibility
// role by adapting to each app's schema (profiles / user_roles / org_memberships
// / tenant). Verifies password login at the end and writes fleet.json for the
// browser probe.
//
// Needs: MGMT (Supabase Management token), MON_EMAIL, MON_PASS in env.

import fs from "node:fs";

const { MGMT, MON_EMAIL, MON_PASS } = process.env;
// Only projects whose backend still exists AND that MGMT can see. Deliberately
// excluded: work / fieldsync / expense / wa / email / website (backends deleted
// — frontends stay live on purpose), and vendorverification / smb-connect
// (different Supabase orgs, so they need their own MGMT token to provision).
const APPS = [
  ["crm", "mlvgqudcwlkolsbighnn", "https://crm.in-sync.co.in"],
  ["globalcrm", "ejzjrvazegaxrhqizgaa", "https://globalcrm.in-sync.co.in"],
  ["event", "gwfofzqrfpwojejjodgz", "https://event.in-sync.co.in"],
  ["ats", "htdwkhtfdifwajdkkpul", "https://ats-6t2.pages.dev"],
  ["rmpl", "ufwvyybrctjpwipbveqe", "https://rmpl.in-sync.co.in"],
];
const ROLE_PREF = ["platform_admin", "admin", "admin_tech", "leadership", "manager", "approver", "sales_agent", "agent"];

// NOTE: spread `...o` FIRST, then headers, so a per-call Content-Type never
// clobbers the Authorization header (that bug 401'd every POST on the first try).
const api = (p, o) => fetch("https://api.supabase.com" + p, { ...o, headers: { Authorization: `Bearer ${MGMT}`, ...(o?.headers || {}) } });
const keys = async (ref) => { const j = await (await api(`/v1/projects/${ref}/api-keys?reveal=true`)).json(); return { pub: (j.find(k => k.type === "publishable") || {}).api_key, secret: (j.find(k => k.type === "secret") || {}).api_key }; };
const sql = async (ref, query) => { const r = await api(`/v1/projects/${ref}/database/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) }); const j = await r.json(); if (!Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0, 160)); return j; };
const cols = async (ref, t) => (await sql(ref, `select column_name from information_schema.columns where table_schema='public' and table_name='${t}'`)).map(r => r.column_name);
const has = async (ref, t) => (await sql(ref, `select to_regclass('public.${t}') r`))[0].r != null;
const e = (s) => s === null ? "null" : "'" + String(s).replace(/'/g, "''") + "'";

const out = [];
for (const [name, ref, url] of APPS) {
  const rec = { name, ref, url };
  try {
    const { pub, secret } = await keys(ref);
    rec.pub = pub;
    if (!secret) { rec.status = "no secret key"; out.push(rec); console.log(name, rec.status); continue; }
    const AUTH = `https://${ref}.supabase.co/auth/v1`;
    let uid;
    const cr = await fetch(`${AUTH}/admin/users`, { method: "POST", headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify({ email: MON_EMAIL, password: MON_PASS, email_confirm: true, user_metadata: { full_name: "Sentinel Monitor" } }) });
    const cj = await cr.json();
    if (cr.status < 300) uid = cj.id;
    else { const list = await (await fetch(`${AUTH}/admin/users?per_page=200`, { headers: { apikey: secret, Authorization: `Bearer ${secret}` } })).json(); uid = (list.users || []).find(u => u.email === MON_EMAIL)?.id; if (uid) await fetch(`${AUTH}/admin/users/${uid}`, { method: "PUT", headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify({ password: MON_PASS, email_confirm: true }) }); }
    if (!uid) { rec.status = "user create failed: " + JSON.stringify(cj).slice(0, 100); out.push(rec); console.log(name, rec.status); continue; }
    rec.uid = uid;

    let orgId = null;
    if (await has(ref, "organizations")) orgId = (await sql(ref, "select id from organizations order by created_at nulls last limit 1"))[0]?.id || null;
    if (!orgId && await has(ref, "tenants")) orgId = (await sql(ref, "select id from tenants limit 1"))[0]?.id || null;
    const grants = [];

    if (await has(ref, "profiles")) {
      const pc = await cols(ref, "profiles");
      const f = ["id"], v = [e(uid)];
      const add = (c, val) => { if (pc.includes(c)) { f.push(c); v.push(val); } };
      add("email", e(MON_EMAIL)); add("full_name", e("Sentinel Monitor")); add("is_active", "true");
      add("onboarding_completed", "true"); add("onboarding_skipped", "true"); add("status", e("active"));
      if (orgId) { add("organization_id", e(orgId)); add("tenant_id", e(orgId)); }
      try { await sql(ref, `insert into profiles(${f.join(",")}) values(${v.join(",")}) on conflict (id) do update set ${f.filter(x => x !== "id").map(x => x + "=excluded." + x).join(",")}`); grants.push("profile"); }
      catch (err) { rec.profileErr = String(err).slice(0, 90); }
    }
    if (await has(ref, "user_roles")) {
      const uc = await cols(ref, "user_roles");
      const existing = (await sql(ref, "select distinct role from user_roles")).map(r => r.role);
      const role = ROLE_PREF.find(r => existing.includes(r)) || existing[0] || "admin";
      const f = ["user_id", "role"], v = [e(uid), e(role)];
      if (uc.includes("org_id") && orgId) { f.push("org_id"); v.push(e(orgId)); }
      if (uc.includes("organization_id") && orgId) { f.push("organization_id"); v.push(e(orgId)); }
      if (uc.includes("tenant_id") && orgId) { f.push("tenant_id"); v.push(e(orgId)); }
      if (uc.includes("is_active")) { f.push("is_active"); v.push("true"); }
      try { await sql(ref, `insert into user_roles(${f.join(",")}) select ${v.join(",")} where not exists(select 1 from user_roles where user_id=${e(uid)})`); grants.push("role:" + role); }
      catch (err) { rec.roleErr = String(err).slice(0, 90); }
    }
    if (await has(ref, "org_memberships") && orgId) {
      const mc = await cols(ref, "org_memberships");
      const f = ["user_id"], v = [e(uid)];
      if (mc.includes("org_id")) { f.push("org_id"); v.push(e(orgId)); } else if (mc.includes("organization_id")) { f.push("organization_id"); v.push(e(orgId)); }
      if (mc.includes("role")) { f.push("role"); v.push(e("admin")); }
      if (mc.includes("status")) { f.push("status"); v.push(e("active")); }
      try { await sql(ref, `insert into org_memberships(${f.join(",")}) select ${v.join(",")} where not exists(select 1 from org_memberships where user_id=${e(uid)})`); grants.push("orgmember"); }
      catch (err) { rec.omErr = String(err).slice(0, 90); }
    }
    rec.grants = grants;

    const lj = await (await fetch(`${AUTH}/token?grant_type=password`, { method: "POST", headers: { apikey: pub, "Content-Type": "application/json" }, body: JSON.stringify({ email: MON_EMAIL, password: MON_PASS }) })).json();
    rec.login = lj.access_token ? "OK" : ("FAIL " + JSON.stringify(lj).slice(0, 80));
    rec.status = "done";
  } catch (err) { rec.status = "ERR " + String(err).slice(0, 120); }
  out.push(rec);
  console.log(`${name.padEnd(20)} login=${(rec.login || "-").padEnd(7)} grants=[${(rec.grants || []).join(",")}] ${rec.status}${rec.roleErr ? " roleErr:" + rec.roleErr : ""}${rec.profileErr ? " profErr:" + rec.profileErr : ""}`);
}
// fleet.json is generated output (gitignored) — probe.mjs reads it at runtime.
const fleet = out.map(r => ({ name: r.name, ref: r.ref, url: r.url, pub: r.pub, login: r.login || "-" }));
fs.writeFileSync(new URL("./fleet.json", import.meta.url), JSON.stringify(fleet, null, 2));
console.log("\nfleet.json written:", fleet.filter(f => f.login === "OK").length, "of", fleet.length, "logged in");
