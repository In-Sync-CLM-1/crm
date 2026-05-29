// Deploys one Cloudflare Worker per entry in jobs.json, each on its own Cron
// Trigger, replacing the flaky pg_cron + pg_net path. Re-runnable / idempotent
// (PUT overwrites). Reads all credentials from ../.env — nothing secret is
// hardcoded or printed.
//
//   node cron-worker/deploy.mjs
//
// Needs in ../.env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY.

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
const PREFIX = "crm-cron-";

for (const [k, v] of Object.entries({ ACCOUNT, TOKEN, SUPABASE_URL, SRK })) {
  if (!v) { console.error(`Missing ${k} in ../.env`); process.exit(1); }
}

const jobs = JSON.parse(fs.readFileSync(path.join(__dirname, "jobs.json"), "utf8"));
const workerSrc = fs.readFileSync(path.join(__dirname, "src", "worker.js"), "utf8");

async function cf(url, opts = {}) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${url}`, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(opts.headers || {}) },
  });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok && body.success !== false, status: r.status, body };
}

async function deploy(job) {
  const name = PREFIX + job.name;
  const metadata = {
    main_module: "worker.js",
    compatibility_date: "2025-06-01",
    bindings: [
      { type: "plain_text", name: "TARGET_FN", text: job.fn },
      { type: "plain_text", name: "SUPABASE_URL", text: SUPABASE_URL },
      { type: "plain_text", name: "TARGET_BODY", text: job.body ? JSON.stringify(job.body) : "{}" },
      { type: "secret_text", name: "SUPABASE_SERVICE_ROLE_KEY", text: SRK },
    ],
  };
  const fd = new FormData();
  fd.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  fd.append("worker.js", new Blob([workerSrc], { type: "application/javascript+module" }), "worker.js");

  const up = await cf(`/accounts/${ACCOUNT}/workers/scripts/${name}`, { method: "PUT", body: fd });
  if (!up.ok) return { name, ok: false, step: "upload", status: up.status, err: up.body.errors };

  const sch = await cf(`/accounts/${ACCOUNT}/workers/scripts/${name}/schedules`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ cron: job.schedule }]),
  });
  if (!sch.ok) return { name, ok: false, step: "schedule", status: sch.status, err: sch.body.errors };

  return { name, ok: true, fn: job.fn, schedule: job.schedule };
}

let okCount = 0;
const fails = [];
for (const job of jobs) {
  const r = await deploy(job);
  if (r.ok) {
    okCount++;
    console.log(`OK   ${r.name}  ->  ${r.fn}  [${r.schedule}]`);
  } else {
    fails.push(r);
    console.log(`FAIL ${r.name}  (${r.step} ${r.status}) ${JSON.stringify(r.err)}`);
  }
}
console.log(`\nDeployed ${okCount}/${jobs.length}, failed ${fails.length}`);
process.exit(fails.length ? 1 : 0);
