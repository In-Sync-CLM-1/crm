// Verifies the crm-cron Workers: lists them, confirms each cron schedule is
// attached, and proves the worker's outbound auth/routing works by replicating
// its exact request against a safe, idempotent function (lead scoring).
//
//   node cron-worker/verify.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseEnv(p) {
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const env = parseEnv(path.join(__dirname, "..", ".env"));
const ACCOUNT = env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = env.CLOUDFLARE_API_TOKEN;
const SUPABASE_URL = env.SUPABASE_URL;
const SRK = env.SUPABASE_SERVICE_ROLE_KEY;

// Safe to actually trigger: internal scoring, idempotent, no outbound sends.
const SAFE_TESTS = ["mkt-lead-scorer"];

async function cf(url) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${url}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  return (await r.json().catch(() => ({}))).result;
}

const scripts = (await cf(`/accounts/${ACCOUNT}/workers/scripts`)) || [];
const names = scripts.map((s) => s.id).filter((n) => n.startsWith("crm-cron-")).sort();
console.log(`crm-cron workers found: ${names.length}\n`);

let withSchedule = 0;
for (const n of names) {
  const res = await cf(`/accounts/${ACCOUNT}/workers/scripts/${n}/schedules`);
  const schedules = (res && (res.schedules || res)) || [];
  const crons = schedules.map((s) => s.cron).filter(Boolean);
  if (crons.length) withSchedule++;
  console.log(`  ${crons.length ? "✓" : "✗"} ${n}  [${crons.join(", ") || "NO SCHEDULE"}]`);
}
console.log(`\n${withSchedule}/${names.length} workers have a cron schedule attached.`);

console.log("\nAuth/routing test (replicates the worker's exact request):");
for (const fn of SAFE_TESTS) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" },
    body: "{}",
  });
  console.log(`  ${fn}: HTTP ${r.status} ${r.status < 400 ? "(reachable + authorized)" : "(check function)"}`);
}
