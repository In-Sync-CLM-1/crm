// Autonomous YouTube upload using the saved refresh token. Multipart upload.
import fs from 'node:fs';
import https from 'node:https';
import qs from 'node:querystring';

const env = fs.readFileSync('C:/Users/Admin/crm/.env', 'utf8');
const get = (k) => { const m = env.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''; };
const cid = get('GOOGLE_CLIENT_ID'), sec = get('GOOGLE_CLIENT_SECRET'), rt = get('YOUTUBE_REFRESH_TOKEN');
const FILE = process.argv[2] || 'C:/Users/Admin/Downloads/worksync-ads/video/worksync-ad.mp4';

const meta = {
  snippet: {
    title: 'WorkSync — Task accountability for Indian teams',
    description: 'You gave the task. Do you know if it\'s done?\n\nWorkSync gives Indian teams hierarchical task accountability with WhatsApp + email alerts at every step. From ₹199/user/month. 14-day free trial, no card.\n\nStart free → https://work.in-sync.co.in',
    tags: ['task management', 'task accountability', 'whatsapp', 'india', 'team productivity', 'worksync'],
    categoryId: '28', // Science & Technology
  },
  status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: false, madeForKids: false },
};

function post(host, path, body) {
  return new Promise((r) => { const d = qs.stringify(body); const q = https.request({ host, path, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(d) } }, (x) => { let b = ''; x.on('data', (c) => b += c); x.on('end', () => r({ s: x.statusCode, b })); }); q.write(d); q.end(); });
}

(async () => {
  const t = await post('oauth2.googleapis.com', '/token', { client_id: cid, client_secret: sec, refresh_token: rt, grant_type: 'refresh_token' });
  if (t.s !== 200) { console.log('token refresh failed', t.s, t.b.slice(0, 150)); process.exit(1); }
  const at = JSON.parse(t.b).access_token;

  const boundary = 'wsbnd_' + FILE.length + '_42';
  const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`);
  const video = fs.readFileSync(FILE);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const payload = Buffer.concat([head, video, tail]);

  const req = https.request({
    host: 'www.googleapis.com',
    path: '/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status',
    method: 'POST',
    headers: { Authorization: 'Bearer ' + at, 'Content-Type': `multipart/related; boundary=${boundary}`, 'Content-Length': payload.length },
  }, (x) => { let b = ''; x.on('data', (c) => b += c); x.on('end', () => {
    if (x.statusCode !== 200) { console.log('UPLOAD FAILED', x.statusCode, b.slice(0, 400)); process.exit(1); }
    const j = JSON.parse(b);
    console.log('UPLOADED ✓  videoId:', j.id);
    console.log('WATCH:', 'https://youtu.be/' + j.id);
    console.log('STUDIO:', 'https://studio.youtube.com/video/' + j.id + '/edit');
    console.log('privacy:', j.status?.privacyStatus, '| uploadStatus:', j.status?.uploadStatus);
  }); });
  req.on('error', (e) => { console.log('req error', String(e)); process.exit(1); });
  req.write(payload); req.end();
})();
