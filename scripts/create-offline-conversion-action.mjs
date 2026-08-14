// Creates (idempotently) the Google Ads offline conversion action used by the
// CRM -> Google Ads feedback loop. Offline = uploaded by gclid from our CRM when
// a lead reaches a real stage, so Google's bidding learns which clicks become
// genuine business — not just form fills.
//
// Phase 1 creates "CRM Qualified Lead (offline)". Pass `won` as an arg to also
// create the Phase-2 revenue action. Reads creds from crm/.env. Prints resource
// names so they can be stored in mkt_engine_config for the uploader.

import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '').replace(/\r$/, '')]; })
);

const CID = '6785487693';
const API = 'https://googleads.googleapis.com/v25'; // keep in step with _shared/googleAdsClient.ts

const WANT = [
  { name: 'CRM Qualified Lead (offline)', category: 'QUALIFIED_LEAD' },
  ...(process.argv.includes('won') ? [{ name: 'CRM Won / Revenue (offline)', category: 'PURCHASE' }] : []),
];

async function token() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_ADS_CLIENT_ID, client_secret: env.GOOGLE_ADS_CLIENT_SECRET, refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN, grant_type: 'refresh_token' }),
  });
  if (!r.ok) throw new Error(`OAuth ${r.status}: ${await r.text()}`);
  return (await r.json()).access_token;
}

async function main() {
  const t = await token();
  const H = { Authorization: `Bearer ${t}`, 'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN, 'Content-Type': 'application/json' };

  // Existing actions, so we don't create duplicates.
  const sr = await fetch(`${API}/customers/${CID}/googleAds:search`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ query: 'SELECT conversion_action.resource_name, conversion_action.name FROM conversion_action' }),
  });
  const existing = new Map(((await sr.json()).results || []).map((x) => [x.conversionAction.name, x.conversionAction.resourceName]));

  const out = {};
  for (const w of WANT) {
    if (existing.has(w.name)) { out[w.category] = existing.get(w.name); console.log(`exists: ${w.name} -> ${out[w.category]}`); continue; }
    const mr = await fetch(`${API}/customers/${CID}/conversionActions:mutate`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ operations: [{ create: {
        name: w.name,
        type: 'UPLOAD_CLICKS',
        category: w.category,
        status: 'ENABLED',
        countingType: 'ONE_PER_CLICK',
        valueSettings: { defaultValue: 0, alwaysUseDefaultValue: w.category !== 'PURCHASE' },
      } }] }),
    });
    const body = await mr.json();
    if (!mr.ok) throw new Error(`create "${w.name}" failed: ${mr.status} ${JSON.stringify(body)}`);
    out[w.category] = body.results[0].resourceName;
    console.log(`created: ${w.name} -> ${out[w.category]}`);
  }
  console.log('\nJSON ' + JSON.stringify(out));
}
main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
