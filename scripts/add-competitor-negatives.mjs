// One-off: add competitor BRAND names as EXACT-match negative keywords to the
// live WorkSync Search campaign. Exact match means we stop showing for the bare
// brand search (e.g. "jira") while STILL appearing for switch-intent queries
// like "jira alternative" / "asana alternative" — which the business wants to keep.
//
// Reads Google Ads creds from crm/.env. No secrets are printed.

import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '').replace(/\r$/, '')];
    })
);

const CUSTOMER_ID = '6785487693';
const API = 'https://googleads.googleapis.com/v25'; // keep in step with _shared/googleAdsClient.ts

// Bare competitor brands — exact negatives so "<brand> alternative" stays eligible.
const BRANDS = [
  'jira', 'asana', 'clickup', 'trello', 'monday.com', 'monday com',
  'notion', 'basecamp', 'wrike', 'smartsheet', 'todoist',
  'zoho projects', 'microsoft project', 'ms project',
];

async function accessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_ADS_CLIENT_ID,
      client_secret: env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error(`OAuth failed: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}

function headers(token) {
  const h = {
    Authorization: `Bearer ${token}`,
    'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN,
    'Content-Type': 'application/json',
  };
  // This account is accessed directly (not under an MCC manager), so the
  // login-customer-id header must NOT be sent — including it triggers
  // USER_PERMISSION_DENIED. Opt in only if explicitly forced.
  const login = (process.env.FORCE_LOGIN_CID || '').replace(/-/g, '');
  if (login) h['login-customer-id'] = login;
  return h;
}

async function main() {
  const token = await accessToken();

  // 1. Find the enabled Search campaign(s).
  const sr = await fetch(`${API}/customers/${CUSTOMER_ID}/googleAds:search`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      query: `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type
              FROM campaign
              WHERE campaign.advertising_channel_type = 'SEARCH'`,
    }),
  });
  if (!sr.ok) throw new Error(`campaign search failed: ${sr.status} ${await sr.text()}`);
  const rows = (await sr.json()).results || [];
  console.log('Search campaigns found:');
  rows.forEach((r) => console.log(`  - ${r.campaign.name} [${r.campaign.status}] id=${r.campaign.id}`));

  const targets = rows.filter((r) => r.campaign.status === 'ENABLED');
  if (targets.length === 0) throw new Error('No ENABLED search campaign found.');

  // 2. Add exact-match negative keywords on each enabled search campaign.
  for (const t of targets) {
    const campaignRes = `customers/${CUSTOMER_ID}/campaigns/${t.campaign.id}`;
    const operations = BRANDS.map((text) => ({
      create: { campaign: campaignRes, negative: true, keyword: { text, matchType: 'EXACT' } },
    }));

    const mr = await fetch(`${API}/customers/${CUSTOMER_ID}/campaignCriteria:mutate`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({ operations, partialFailure: true }),
    });
    const body = await mr.json();
    if (!mr.ok) throw new Error(`mutate failed: ${mr.status} ${JSON.stringify(body)}`);

    const added = (body.results || []).filter((x) => x && x.resourceName).length;
    console.log(`\n"${t.campaign.name}": ${added}/${BRANDS.length} negatives added.`);
    if (body.partialFailureError) {
      // Usually "already exists" for ones added on a previous run — non-fatal.
      console.log('  Notes (likely already-present duplicates):',
        JSON.stringify(body.partialFailureError.details?.[0]?.errors?.map((e) => e.message) || body.partialFailureError.message));
    }
  }
  console.log('\nDone.');
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
