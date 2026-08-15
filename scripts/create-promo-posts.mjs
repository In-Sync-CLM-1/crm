// Queue the eight product promos as company video posts, one a day at the
// 10:00 slot.
//   node scripts/create-promo-posts.mjs [--dry-run]
//
// The promos are already on YouTube (scripts/promo-youtube-ids.json), so each
// row carries its yt_video_id up front and mkt-social-youtube skips the
// fan-out upload instead of putting a second copy on the channel. LinkedIn,
// Facebook, Instagram and X still receive the video natively from R2.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'C:/Users/Admin/crm';
const DRY = process.argv.includes('--dry-run');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const get = (k) => { const m = env.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''; };

const REF = 'mlvgqudcwlkolsbighnn';
const TOKEN = get('SUPABASE_ACCESS_TOKEN');
const ORG = '65e22e43-f23d-4c0a-9d84-2eba65ad0e12';
const STORE = get('R2_MARKETING_WORKER_URL');
const SLOT_INDEX = 2;          // 10:00 IST — clear of every slot already in the buffer
const START = '2026-08-15';

const ytIds = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/promo-youtube-ids.json'), 'utf8'));

// Ordered strongest-first: the flagship CRM leads, the niche tools follow.
const POSTS = [
  {
    product_key: 'globalcrm', file: 'globalcrm-promo-vertical.mp4',
    title: 'In-Sync CRM — the AI-native CRM your team will actually use',
    url: 'https://in-sync.co.in/products/crm',
    caption: [
      'Your CRM is where leads go to quietly die.',
      "Reps hate updating it, so the pipeline you report on is three weeks stale — and you're flying blind on the deals that matter this month.",
      'In-Sync CRM does the work for them. Every channel lands in one pipeline, tagged by source, the moment it arrives. Contacts enrich themselves and get scored, with the reason attached. The AI listens to calls and tells each rep exactly what to fix. And the command centre says which deals to chase today.',
      'Less busywork, more closing, and a CRM your sales team will adopt.',
      'See it in 90 seconds → https://in-sync.co.in/products/crm',
    ].join('\n\n'),
  },
  {
    product_key: 'vendorverification', file: 'vendor-sync-promo-vertical.mp4',
    title: 'Vendor-Sync — know your vendor before you commit',
    url: 'https://in-sync.co.in/products/vendor-verification',
    caption: [
      "Every new vendor is a stranger you're about to pay.",
      'A PAN, a bank line, nobody actually checked — and the fraud surfaces after the purchase order is signed.',
      'Vendor-Sync checks PAN, GST and bank against government sources in minutes, and flags duplicate identities and tampered documents before you commit. Then it keeps that verified identity attached through onboarding, every invoice, every advance and every settlement — not a report you file away and forget.',
      'Vendors file their own paperwork. The AI reads it. Your team just approves.',
      'Audit-ready, without a spreadsheet → https://in-sync.co.in/products/vendor-verification',
    ].join('\n\n'),
  },
  {
    product_key: 'whatsapp', file: 'wa-promo-vertical.mp4',
    title: 'In-Sync WhatsApp — the official Business API, made simple',
    url: 'https://in-sync.co.in/products/whatsapp-campaigns',
    caption: [
      'Your customers are already on WhatsApp — and they open it. 98%, usually within minutes.',
      "Email gets ignored. WhatsApp gets read. But most businesses still run it off one phone in someone's pocket, with no templates, no tracking and no compliance cover.",
      'In-Sync WhatsApp is the full toolkit on the official Business API: broadcast campaigns to your whole list in minutes, personalised and scheduled. An AI inbox trained on your own catalogue that replies in seconds, day or night. Pre-approved templates for offers, order updates and OTPs. Delivery, open and reply tracking on every send.',
      'Messages that get read → https://in-sync.co.in/products/whatsapp-campaigns',
    ].join('\n\n'),
  },
  {
    product_key: 'ats', file: 'ats-promo-vertical.mp4',
    title: 'In-Sync ATS — sourcing is the easy part. We run the pipeline',
    url: 'https://in-sync.co.in/products/ats',
    caption: [
      'Eight hundred candidates across three spreadsheets. Now tell me where each one stands.',
      'Sourcing was never the bottleneck. Losing track of people after they apply is.',
      'In-Sync ATS puts the whole pipeline on one live screen. Mandates carry deadlines, so you see one slipping before the client calls. Candidates arrive parsed, de-duplicated and AI-scored into a ranked list. Aadhaar and PAN checks sit inside the flow, audit-ready and DPDP-compliant. And between offer and day one, the AI calls the reminders — a quiet candidate gets caught, and the yes comes back in writing.',
      'A clean, scored database and verified placements → https://in-sync.co.in/products/ats',
    ].join('\n\n'),
  },
  {
    product_key: 'event', file: 'eventsync-promo-vertical.mp4',
    title: 'EventSync — registration is the easy part. We run the day',
    url: 'https://in-sync.co.in/products/eventsync',
    caption: [
      'Your event is your big moment. So why is it running on a Google Form, a WhatsApp group and a printed list at the door?',
      'Forty percent of registrations never show up. And the leads you did meet sit in a notebook for two days.',
      'EventSync runs the day. Automatic WhatsApp reminders, and when a guest goes quiet the AI calls them — so the room fills for real. QR check-in with a live count on every screen. Every guest scored as they leave, so your hottest lead is ranked and waiting the next morning.',
      'A packed room, a flawless day, leads you can act on → https://in-sync.co.in/products/eventsync',
    ].join('\n\n'),
  },
  {
    product_key: 'expense', file: 'expense-promo-vertical.mp4',
    title: 'In-Sync Expense — control over every rupee claimed, advanced and taxed',
    url: 'https://in-sync.co.in/products/expense',
    caption: [
      'Every claim is a number someone typed. Every advance is cash that left before anyone checked.',
      'Nobody is watching closely enough — and that is exactly where the money goes.',
      'In-Sync Expense reconciles advances automatically against what was approved: what is owed, what is recovered, no ledger matched by hand. The AI reads the GST number and the tax straight off the receipt, so input credit sitting in a drawer today is recovered tomorrow. Filing takes a minute — a photo, not a form — so your team actually uses it. Every action timestamped with a name on it, and month-end is one click.',
      'Start free, no credit card → https://in-sync.co.in/products/expense',
    ].join('\n\n'),
  },
  {
    product_key: 'email', file: 'email-promo-vertical.mp4',
    title: 'In-Sync Email — land in the inbox, every time',
    url: 'https://in-sync.co.in/products/email-broadcast',
    caption: [
      'You send a thousand emails and half of them land in spam.',
      "That's not a copy problem. It's a delivery problem — and no amount of rewriting the subject line fixes it.",
      'In-Sync Email is built to reach the inbox. Pick a template, choose your audience, send thousands of personalised emails in minutes. Welcome series, follow-ups and drip sequences fire the moment someone joins your list. A library of polished templates keeps every send on brand. Opens, clicks and bounces tracked in real time, so each campaign is smarter than the last.',
      'Emails that land, and a list that turns into revenue → https://in-sync.co.in/products/email-broadcast',
    ].join('\n\n'),
  },
  {
    product_key: 'fieldsync', file: 'field-promo.mp4',
    title: 'In-Sync Field — know your field team is working',
    url: 'https://in-sync.co.in/products/field-sync',
    caption: [
      'Your field team is out there somewhere. Visiting customers — or parked at a chai stall?',
      'You find out at the end of the month, from a report they wrote themselves.',
      "In-Sync Field shows every rep on a live GPS-verified map with today's route as it happens. Recurring beat plans put the right rep in front of the right customers, week after week. Directed visit lists land straight on their phone. And visits, orders, distance and collections come back per rep in one clear report.",
      'Visits you can trust, and a field team you can finally see → https://in-sync.co.in/products/field-sync',
    ].join('\n\n'),
  },
  {
    product_key: 'worksync', file: 'worksync-promo-vertical.mp4',
    title: 'Work-Sync — you assign, it chases, done means done',
    url: 'https://in-sync.co.in/products/worksync',
    caption: [
      "You gave the task. Do you know it's done?",
      'A message in a group chat is not a system — and the compliance filing nobody closed costs ₹200 a day until someone notices.',
      'Work-Sync puts every task on one screen with an owner, a due date and a priority, and chases them for you. Every stage change reaches the right person — WhatsApp first, email as backup, up the hierarchy. And done means done: the person who assigned the task is the one who signs it off.',
      'Deadlines that hold, a team nobody has to chase, and penalties you never pay.',
      'Start free — 14 days, no card → https://in-sync.co.in/products/worksync',
    ].join('\n\n'),
  },
];

const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const q = (v) => v === null ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'";

const rows = POSTS.map((p, i) => {
  const yt = ytIds[p.file];
  if (!yt) throw new Error('no YouTube id recorded for ' + p.file);
  return {
    org_id: ORG,
    publish_date: addDays(START, i),
    linkedin_slot_index: SLOT_INDEX,
    channel: 'company',
    status: 'pending',
    post_format: 'video',
    product_key: p.product_key,
    blog_title: p.title,
    blog_url: p.url,
    linkedin_short_caption: p.caption,
    video_url: STORE + '/promo/' + p.file,
    yt_video_id: yt.videoId,
    yt_posted_at: yt.uploadedAt,
  };
});

// Already-queued promos must not be inserted twice — this script is re-run
// whenever a new product promo joins the set.
const existing = await fetch('https://api.supabase.com/v1/projects/' + REF + '/database/query', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', 'User-Agent': 'curl/8' },
  body: JSON.stringify({ query: "select product_key, publish_date from blog_posts where video_url like '%/promo/%'" }),
}).then((r) => r.json()).catch(() => []);
const queued = new Set((existing || []).map((r) => r.product_key));
const lastDate = (existing || []).map((r) => r.publish_date).sort().pop();

const pending = rows.filter((r) => !queued.has(r.product_key));
if (!pending.length) { console.log('every promo is already queued — nothing to do'); process.exit(0); }
// Re-date the pending ones to follow whatever is already on the calendar.
pending.forEach((r, i) => { r.publish_date = lastDate ? addDays(lastDate, i + 1) : r.publish_date; });
rows.length = 0;
rows.push(...pending);

const cols = Object.keys(rows[0]);
const sql = 'INSERT INTO blog_posts (' + cols.join(', ') + ') VALUES\n' +
  rows.map((r) => '  (' + cols.map((c) => q(r[c])).join(', ') + ')').join(',\n') +
  '\nRETURNING id, publish_date, product_key, post_format, status;';

if (DRY) {
  rows.forEach((r) => console.log(r.publish_date + ' 10:00  ' + r.product_key.padEnd(18) + ' ' + r.video_url.split('/').pop() + '  yt:' + r.yt_video_id + '  caption:' + r.linkedin_short_caption.length + ' chars'));
  process.exit(0);
}

const res = await fetch('https://api.supabase.com/v1/projects/' + REF + '/database/query', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', 'User-Agent': 'curl/8' },
  body: JSON.stringify({ query: sql }),
});
console.log(res.status, (await res.text()).slice(0, 2000));
