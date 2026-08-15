// One-time import of the BD target spreadsheet into bd_firms / bd_contacts /
// bd_exclusions. After this the database is the source of truth — the sheet had
// already drifted into two files with different contacts, and opt-outs were
// tracked by cell highlighting, which nothing downstream can read.
//
//   node scripts/bd-import-target-list.mjs [--dry-run]
//
// Re-runnable: firms match on name_key and are updated, never duplicated.
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

const ROOT = 'C:/Users/Admin/crm-bd';
const SHEET = 'C:/Users/Admin/Downloads/us-boutique-target-list.xlsx';
const DRY = process.argv.includes('--dry-run');
const ORG = '65e22e43-f23d-4c0a-9d84-2eba65ad0e12';
const REF = 'mlvgqudcwlkolsbighnn';

const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const get = (k) => { const m = env.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''; };
const TOKEN = get('SUPABASE_ACCESS_TOKEN');

const sql = async (query) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'curl/8' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
};

const q = (v) => (v === null || v === undefined || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : null; };

// Clutch re-serves sponsored listings across pages, so dedupe on a normalised
// key rather than the printed name.
const nameKey = (s) => String(s || '')
  .toLowerCase()
  .replace(/\b(inc|llc|ltd|corp|co|company|group|technologies|technology)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// Firms already contacted in batch 1 — they must not re-enter drafting.
const ALREADY_SENT = [
  'Ad Victoriam Solutions', 'DOOR3', 'SOLTECH', 'Traction Consulting Group',
  'LaunchPad Lab', 'NineTwoThree AI Studio', 'fjorge', 'Orases', 'Ticomix',
  'Trailhead Technology Partners', 'BlueLabel', 'Moreland Connect',
  'Red Hawk Technologies', 'Revelry Labs',
];

// The spec's permanent exclusion list, plus the live opt-out.
const EXCLUSIONS = [
  ['Utegration', 'acquired by Cognizant', true, null],
  ['Headspring', 'acquired by Accenture', true, null],
  ['Woodridge Software', 'acquired by RCG/Myridius', true, null],
  ['Nuvem Consulting', 'acquired by PK', true, null],
  ['Linnify', 'Romanian delivery', true, null],
  ['WiserBrand', 'Ukraine + Argentina R&D', true, null],
  ['Def Method', 'markets 100% onshore', true, null],
  ['Eureka Software', 'markets 100% Austin-based', true, null],
  ['TangoCode', 'MarTech + diversity certified', true, null],
  ['Metrotechs', 'too small to pay', false, 'batch 3'],
  ['Zakkour Tech Group', 'no contact findable', false, 'if a contact surfaces'],
  ['Flint Hills Group', 'Dave Cunningham opted out via reply 2026-08-12 — DO NOT CONTACT', true, null],
];

// Read through a buffer: XLSX.readFile can't open the sheet while Excel holds
// a lock on it, which it does whenever the file is open on screen.
const wb = XLSX.read(fs.readFileSync(SHEET), { type: 'buffer' });
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Target List'], { defval: null });
console.log(`sheet: ${rows.length} rows`);

const sentKeys = new Set(ALREADY_SENT.map(nameKey));
const exclKeys = new Set(EXCLUSIONS.map(([n]) => nameKey(n)));

const firms = [];
const contacts = [];
const seen = new Set();

for (const r of rows) {
  const name = r['Firm'];
  if (!name) continue;
  const key = nameKey(name);
  if (seen.has(key)) continue;       // in-sheet duplicate
  seen.add(key);

  const grade = ['A', 'B', 'C', 'X', '?'].includes(r['Priority']) ? r['Priority'] : null;
  const stateFlag = exclKeys.has(key) ? 'EXCLUDED' : sentKeys.has(key) ? 'SENT' : null;
  const stateReason = exclKeys.has(key)
    ? (EXCLUSIONS.find(([n]) => nameKey(n) === key) || [])[1]
    : sentKeys.has(key) ? 'batch 1, sent 11-13 Aug 2026' : null;

  firms.push({
    name, key, grade, stateFlag, stateReason,
    city: r['City'], state: r['State'], tz: r['Time zone'],
    headcount: r['Headcount'], rate: r['Bills clients'], minProject: r['Min project'],
    fit: num(r['Fit score']), ai: num(r['All AI services %']),
    crm: !!r['CRM/ERP line'], staffAug: !!r['Staff aug line'],
    other: r['Other services'],
    research: r['research_facts'] || null,
    notes: [r['Notes'], r['acquired_check'] ? `acquired_check: ${r['acquired_check']}` : null].filter(Boolean).join(' | ') || null,
  });

  // The sheet carries two contact blocks per row; the second is the fallback.
  // Column names repeat, so xlsx suffixes the duplicates.
  const pairs = [
    { primary: true, n: r['Contact name'], t: r['Title'], e: r['Email'] },
    { primary: false, n: r['Contact name_1'], t: r['Title_1'], e: r['Email_1'] },
  ];
  for (const p of pairs) {
    if (!p.n && !p.e) continue;
    const parts = String(p.n || '').trim().split(/\s+/);
    contacts.push({
      key, primary: p.primary,
      first: parts[0] || null,
      last: parts.length > 1 ? parts.slice(1).join(' ') : null,
      title: p.t, email: p.e,
    });
  }
}

const withFirst = contacts.filter((c) => c.first).length;
console.log(`firms: ${firms.length} | contacts: ${contacts.length} (${withFirst} with a first name)`);
console.log(`marked SENT: ${firms.filter((f) => f.stateFlag === 'SENT').length} | EXCLUDED: ${firms.filter((f) => f.stateFlag === 'EXCLUDED').length}`);
console.log('grades:', Object.entries(firms.reduce((a, f) => ({ ...a, [f.grade || '-']: (a[f.grade || '-'] || 0) + 1 }), {})).map(([k, v]) => `${k}=${v}`).join(' '));

if (DRY) process.exit(0);

// Exclusions first — the pipeline checks these before anything else.
await sql(`INSERT INTO bd_exclusions (org_id, firm_name, name_key, reason, is_permanent, revisit_when) VALUES\n` +
  EXCLUSIONS.map(([n, reason, perm, revisit]) =>
    `(${q(ORG)}, ${q(n)}, ${q(nameKey(n))}, ${q(reason)}, ${perm}, ${q(revisit)})`).join(',\n') +
  ` ON CONFLICT (org_id, name_key) DO UPDATE SET reason = EXCLUDED.reason, is_permanent = EXCLUDED.is_permanent, revisit_when = EXCLUDED.revisit_when;`);
console.log(`exclusions: ${EXCLUSIONS.length} upserted`);

// Firms, in chunks — a single statement with 270 VALUES rows trips the API's
// payload limit.
const CHUNK = 60;
for (let i = 0; i < firms.length; i += CHUNK) {
  const slice = firms.slice(i, i + CHUNK);
  await sql(`INSERT INTO bd_firms
    (org_id, firm_name, name_key, city, state, time_zone, headcount_band, bill_rate_band, min_project,
     fit_score, ai_services_pct, has_crm_erp_line, has_staff_aug, other_services, grade, state_flag,
     state_reason, research_facts, notes)
    VALUES\n` +
    slice.map((f) => `(${q(ORG)}, ${q(f.name)}, ${q(f.key)}, ${q(f.city)}, ${q(f.state)}, ${q(f.tz)}, ${q(f.headcount)}, ${q(f.rate)}, ${q(f.minProject)},
      ${f.fit ?? 'NULL'}, ${f.ai ?? 'NULL'}, ${f.crm}, ${f.staffAug}, ${q(f.other)}, ${q(f.grade)}, ${q(f.stateFlag)},
      ${q(f.stateReason)}, ${f.research ? `jsonb_build_object('raw', ${q(f.research)})` : 'NULL'}, ${q(f.notes)})`).join(',\n') +
    `\n ON CONFLICT (org_id, name_key) DO UPDATE SET
       city = EXCLUDED.city, state = EXCLUDED.state, time_zone = EXCLUDED.time_zone,
       headcount_band = EXCLUDED.headcount_band, bill_rate_band = EXCLUDED.bill_rate_band,
       fit_score = EXCLUDED.fit_score, grade = EXCLUDED.grade,
       state_flag = COALESCE(bd_firms.state_flag, EXCLUDED.state_flag),
       updated_at = now();`);
  console.log(`  firms ${i + 1}-${Math.min(i + CHUNK, firms.length)}`);
}

// Contacts, keyed back to the firm row.
for (let i = 0; i < contacts.length; i += CHUNK) {
  const slice = contacts.slice(i, i + CHUNK);
  await sql(`INSERT INTO bd_contacts (org_id, firm_id, is_primary, first_name, last_name, title, email, source, why_chosen)
    SELECT ${q(ORG)}, f.id, v.is_primary, v.first_name, v.last_name, v.title, v.email, 'sheet', 'imported from the target list'
    FROM (VALUES\n` +
    slice.map((c) => `(${q(c.key)}, ${c.primary}, ${q(c.first)}, ${q(c.last)}, ${q(c.title)}, ${q(c.email)})`).join(',\n') +
    `\n) AS v(name_key, is_primary, first_name, last_name, title, email)
     JOIN bd_firms f ON f.org_id = ${q(ORG)} AND f.name_key = v.name_key
     WHERE NOT EXISTS (
       SELECT 1 FROM bd_contacts c WHERE c.firm_id = f.id AND c.is_primary = v.is_primary
     );`);
  console.log(`  contacts ${i + 1}-${Math.min(i + CHUNK, contacts.length)}`);
}

// The opted-out contact must never be drafted again, even if the sheet still
// carries the row.
await sql(`UPDATE bd_contacts c SET opted_out = true
  FROM bd_firms f WHERE c.firm_id = f.id AND f.state_flag = 'EXCLUDED' AND f.org_id = ${q(ORG)};`);

const [counts] = await sql(`SELECT
  (SELECT count(*) FROM bd_firms WHERE org_id = ${q(ORG)}) AS firms,
  (SELECT count(*) FROM bd_contacts WHERE org_id = ${q(ORG)}) AS contacts,
  (SELECT count(*) FROM bd_exclusions WHERE org_id = ${q(ORG)}) AS exclusions,
  (SELECT count(*) FROM bd_firms WHERE org_id = ${q(ORG)} AND state_flag = 'SENT') AS sent;`);
console.log('in database:', counts);
