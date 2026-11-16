#!/usr/bin/env node
/**
 * Issues a single-use connect link (valid 1 hour) for the company LinkedIn page
 * or the Facebook page + Instagram. Only someone holding the Supabase management
 * token (MGMT_TOKEN in .env) can issue one; the connect callbacks refuse any
 * sign-in that does not come back with this exact code.
 *
 *   node scripts/social-connect-link.mjs linkedin
 *   node scripts/social-connect-link.mjs facebook
 */
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const PROJECT = 'mlvgqudcwlkolsbighnn';
const FN = `https://${PROJECT}.supabase.co/functions/v1`;

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
);

const which = process.argv[2];
const target = {
  linkedin: { table: 'mkt_linkedin_config', flow: 'org', link: (s) => `${FN}/mkt-linkedin-oauth-callback?connect=org&state=${s}` },
  facebook: { table: 'mkt_social_config', flow: 'facebook', link: (s) => `${FN}/mkt-facebook-oauth-callback?connect=1&state=${s}` },
}[which];
if (!target) {
  console.error('Usage: node scripts/social-connect-link.mjs linkedin|facebook');
  process.exit(1);
}

const state = `${target.flow}.${randomBytes(24).toString('hex')}.${Math.floor(Date.now() / 1000) + 3600}`;
const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.MGMT_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `UPDATE public.${target.table} SET oauth_state = '${state}' WHERE active RETURNING id`,
  }),
});
const rows = await res.json();
if (!res.ok || !Array.isArray(rows) || rows.length !== 1) {
  console.error('Could not issue the link:', JSON.stringify(rows));
  process.exit(1);
}
console.log(target.link(state));
