// One-off, re-runnable: repoint every DB routine that calls pg_net from the
// dead legacy project host to the live project host. Caused by the 2026-05-17
// cutover leaving hardcoded supabase.co URLs in plpgsql functions.
//
//   node fix-pgnet-urls.mjs
//   node fix-pgnet-urls.mjs --verify-only

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

const env = parseEnv(path.join(__dirname, ".env"));
const REF = env.SUPABASE_PROJECT_REF;            // mlvgqudcwlkolsbighnn (live)
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const LEGACY = env.SOURCE_SUPABASE_PROJECT_REF;  // knuewnenaswscgaldjej (dead)
const verifyOnly = process.argv.includes("--verify-only");

async function sql(query) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text}`);
  return JSON.parse(text);
}

console.log(`Live host : ${REF}.supabase.co`);
console.log(`Dead host : ${LEGACY}.supabase.co\n`);

// Find every normal function whose body still references the dead host.
const targets = await sql(`
  SELECT n.nspname AS schema, p.proname AS fn, pg_get_functiondef(p.oid) AS def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prokind = 'f'
    AND n.nspname NOT IN ('pg_catalog','information_schema')
    AND pg_get_functiondef(p.oid) ILIKE '%${LEGACY}%'
  ORDER BY n.nspname, p.proname;
`);

console.log(`Functions referencing the dead host: ${targets.length}`);
if (!targets.length) {
  console.log("Nothing to fix.");
  process.exit(0);
}

if (verifyOnly) {
  targets.forEach((t) => console.log(`  - ${t.schema}.${t.fn}`));
  process.exit(0);
}

let fixed = 0;
for (const t of targets) {
  const before = (t.def.match(new RegExp(LEGACY, "g")) || []).length;
  const newDef = t.def.split(LEGACY).join(REF);
  try {
    await sql(newDef);
    fixed++;
    console.log(`  fixed ${t.schema}.${t.fn}  (${before} url${before > 1 ? "s" : ""})`);
  } catch (e) {
    console.log(`  FAILED ${t.schema}.${t.fn}: ${e.message}`);
  }
}

// Re-verify nothing remains.
const leftover = await sql(`
  SELECT count(*)::int AS n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prokind = 'f'
    AND n.nspname NOT IN ('pg_catalog','information_schema')
    AND pg_get_functiondef(p.oid) ILIKE '%${LEGACY}%';
`);

console.log(`\nFixed ${fixed}/${targets.length}. Remaining dead-host references: ${leftover[0].n}`);
