// Batch-upload the product promos to the In-Sync YouTube channel.
//   node scripts/yt-batch-upload.mjs            (uploads whatever quota allows)
//   node scripts/yt-batch-upload.mjs --dry-run  (prints the queue, uploads nothing)
//
// Resumable by design: every success is written to promo-youtube-ids.json, so a
// re-run after YouTube's daily upload quota resets picks up exactly where it
// stopped. Landscape cuts go up first, then the vertical cuts as Shorts.
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import qs from 'node:querystring';

const ROOT = 'C:/Users/Admin/crm';
const DOWNLOADS = 'C:/Users/Admin/Downloads';
const MANIFEST = path.join(ROOT, 'scripts/promo-manifest.json');
const STATE = path.join(ROOT, 'scripts/promo-youtube-ids.json');
const DRY = process.argv.includes('--dry-run');

const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const get = (k) => { const m = env.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''; };

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};

// Landscape first (the main watch-page videos), then the portrait cuts as Shorts.
const queue = [];
for (const p of manifest) queue.push({ ...p, kind: 'landscape', src: path.join(DOWNLOADS, p.file) });
for (const p of manifest) {
  const vertical = p.file.replace(/\.mp4$/, '-vertical.mp4');
  if (fs.existsSync(path.join(DOWNLOADS, vertical))) {
    queue.push({ ...p, kind: 'short', file: vertical, src: path.join(DOWNLOADS, vertical) });
  }
}

const body = (item) => ({
  snippet: {
    title: item.kind === 'short' ? item.shortTitle : item.title,
    description: `${item.desc}\n\n${item.kind === 'short' ? 'Full video and a free demo → ' : 'Book a free demo → '}${item.url}\n\nIn-Sync builds business software for Indian teams — CRM, hiring, events, vendors, expenses, field force, WhatsApp and email, on one platform.\nhttps://in-sync.co.in`,
    tags: item.tags,
    categoryId: '28',
    defaultLanguage: 'en',
  },
  status: { privacyStatus: 'public', selfDeclaredMadeForKids: false, madeForKids: false, embeddable: true },
});

function form(host, p, data) {
  return new Promise((res) => {
    const d = qs.stringify(data);
    const r = https.request({ host, path: p, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(d) } },
      (x) => { let b = ''; x.on('data', (c) => b += c); x.on('end', () => res({ s: x.statusCode, b })); });
    r.on('error', (e) => res({ s: 0, b: String(e) }));
    r.write(d); r.end();
  });
}

function upload(accessToken, item) {
  return new Promise((res) => {
    const boundary = 'insync_' + Date.now();
    const meta = JSON.stringify(body(item));
    const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`);
    const payload = Buffer.concat([head, fs.readFileSync(item.src), Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const req = https.request({
      host: 'www.googleapis.com',
      path: '/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status',
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': `multipart/related; boundary=${boundary}`, 'Content-Length': payload.length },
    }, (x) => { let b = ''; x.on('data', (c) => b += c); x.on('end', () => res({ s: x.statusCode, b })); });
    req.on('error', (e) => res({ s: 0, b: String(e) }));
    req.write(payload); req.end();
  });
}

(async () => {
  const pending = queue.filter((i) => !state[i.file]);
  console.log(`${queue.length} promo cuts, ${queue.length - pending.length} already up, ${pending.length} pending.`);
  if (DRY) { pending.forEach((i) => console.log(` - ${i.file} [${i.kind}]`)); return; }
  if (!pending.length) return;

  const t = await form('oauth2.googleapis.com', '/token', {
    client_id: get('GOOGLE_CLIENT_ID'), client_secret: get('GOOGLE_CLIENT_SECRET'),
    refresh_token: get('YOUTUBE_REFRESH_TOKEN'), grant_type: 'refresh_token',
  });
  if (t.s !== 200) { console.log('token refresh failed', t.s, t.b.slice(0, 200)); process.exit(1); }
  const at = JSON.parse(t.b).access_token;

  for (const item of pending) {
    process.stdout.write(`uploading ${item.file} … `);
    const r = await upload(at, item);
    if (r.s === 200) {
      const j = JSON.parse(r.b);
      state[item.file] = { videoId: j.id, url: 'https://youtu.be/' + j.id, kind: item.kind, title: j.snippet?.title, uploadedAt: new Date().toISOString() };
      fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
      console.log('✓ https://youtu.be/' + j.id);
      continue;
    }
    const reason = (r.b.match(/"reason":\s*"([^"]+)"/) || [])[1] || '';
    console.log('FAILED', r.s, reason || r.b.slice(0, 200));
    // Quota is per-day and shared with the nightly content pipeline: stop cleanly
    // and let the next run resume rather than burning retries against a wall.
    if (/quota|uploadLimit|rateLimit/i.test(reason)) {
      console.log(`\nDaily YouTube quota reached. ${pending.length - Object.keys(state).length} cuts left — re-run after the quota resets (midnight US Pacific).`);
      break;
    }
  }
  console.log(`\n${Object.keys(state).length}/${queue.length} promo cuts live on YouTube.`);
})();
