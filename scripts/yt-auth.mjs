// One-time YouTube OAuth: opens Google consent, captures the redirect on
// localhost, exchanges the code, and saves a YouTube refresh token to .env.
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { execFile } from 'node:child_process';
import qs from 'node:querystring';

const ENV = 'C:/Users/Admin/crm/.env';
const env = fs.readFileSync(ENV, 'utf8');
const get = (k) => { const m = env.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''; };
const CID = get('GOOGLE_CLIENT_ID');
const SEC = get('GOOGLE_CLIENT_SECRET');
const PORT = 4399;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');

const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + qs.stringify({
  client_id: CID, redirect_uri: REDIRECT, response_type: 'code',
  scope: SCOPES, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
});

function post(host, path, body) {
  return new Promise((res) => {
    const data = qs.stringify(body);
    const r = https.request({ host, path, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) } },
      (x) => { let d = ''; x.on('data', (c) => d += c); x.on('end', () => res({ s: x.statusCode, d })); });
    r.on('error', (e) => res({ s: 0, d: String(e) })); r.write(data); r.end();
  });
}
function gget(host, path, headers) {
  return new Promise((res) => { https.get({ host, path, headers }, (x) => { let d = ''; x.on('data', (c) => d += c); x.on('end', () => res({ s: x.statusCode, d })); }).on('error', (e) => res({ s: 0, d: String(e) })); });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  const code = u.searchParams.get('code');
  const err = u.searchParams.get('error');
  if (err) { res.end(`Auth error: ${err}. You can close this tab.`); console.log('AUTH ERROR:', err); server.close(); process.exit(1); }
  if (!code) { res.end('Waiting…'); return; }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<h2 style="font-family:system-ui">✅ YouTube connected. You can close this tab and return to Claude.</h2>');
  const tok = await post('oauth2.googleapis.com', '/token', { code, client_id: CID, client_secret: SEC, redirect_uri: REDIRECT, grant_type: 'authorization_code' });
  if (tok.s !== 200) { console.log('TOKEN EXCHANGE FAILED', tok.s, tok.d.slice(0, 300)); server.close(); process.exit(1); }
  const j = JSON.parse(tok.d);
  const rt = j.refresh_token;
  if (!rt) { console.log('No refresh_token returned (try removing prior grant). Resp:', tok.d.slice(0, 200)); server.close(); process.exit(1); }
  // Save to .env as YOUTUBE_REFRESH_TOKEN (append or replace)
  let e = fs.readFileSync(ENV, 'utf8');
  if (/^YOUTUBE_REFRESH_TOKEN=.*$/m.test(e)) e = e.replace(/^YOUTUBE_REFRESH_TOKEN=.*$/m, 'YOUTUBE_REFRESH_TOKEN=' + rt);
  else e = e.replace(/\s*$/, '') + '\nYOUTUBE_REFRESH_TOKEN=' + rt + '\n';
  fs.writeFileSync(ENV, e);
  const ch = await gget('www.googleapis.com', '/youtube/v3/channels?part=snippet&mine=true', { Authorization: 'Bearer ' + j.access_token });
  let chinfo = 'channel lookup HTTP ' + ch.s;
  try { const cj = JSON.parse(ch.d); chinfo = (cj.items || []).map((i) => `${i.snippet.title} (id ${i.id})`).join(' | ') || 'NO CHANNEL on this account'; } catch {}
  console.log('SUCCESS: YouTube refresh token saved to .env (YOUTUBE_REFRESH_TOKEN).');
  console.log('CHANNEL:', chinfo);
  server.close(); process.exit(0);
});

server.listen(PORT, () => {
  console.log('Listening on', REDIRECT);
  console.log('OPENING CONSENT URL in your browser. Sign in with the Google account that owns your YouTube channel / Google Ads.');
  console.log(authUrl);
  execFile('cmd', ['/c', 'start', '', authUrl], () => {});
});
