// One-time confirmation helper: polls Cloudflare analytics until a crm-cron
// worker invocation appears (proving the cron triggers actually fire), or
// gives up after ~13 minutes. Reads credentials from ../.env.
//
//   node cron-worker/watch-firstrun.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

const ACCOUNT = env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = env.CLOUDFLARE_API_TOKEN;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function check() {
  const since = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const q = `{viewer{accounts(filter:{accountTag:"${ACCOUNT}"}){workersInvocationsAdaptive(limit:100,filter:{datetime_geq:"${since}"}){sum{requests errors} dimensions{scriptName}}}}}`;
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }),
  });
  const d = await res.json();
  const rows = d?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive || [];
  return rows.filter((x) => x.dimensions.scriptName.startsWith("crm-cron"));
}

for (let i = 0; i < 13; i++) {
  const c = await check();
  if (c.length) {
    console.log("FIRST TICK CONFIRMED — crm-cron workers are firing on schedule:");
    c.sort((a, b) => b.sum.requests - a.sum.requests)
      .forEach((x) => console.log(`  ${x.dimensions.scriptName}: ${x.sum.requests} runs, ${x.sum.errors} errors`));
    process.exit(0);
  }
  await sleep(60000);
}
console.log("No crm-cron invocation observed in ~13 min — worth a manual check.");
process.exit(1);
