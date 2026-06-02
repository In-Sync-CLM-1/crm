// WorkSync Acquisition Dashboard — hosted Cloudflare Worker.
// Bookmarkable URL. Caches a daily snapshot + written digest in KV.
// Auto-refreshes once a day (cron) + a manual "Refresh now" button (/refresh).
// No email/WhatsApp — the digest lives in the dashboard itself.

const CID = '6785487693';
const CAMP = '23906419126';

async function token(env) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_ADS_CLIENT_ID, client_secret: env.GOOGLE_ADS_CLIENT_SECRET, refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN, grant_type: 'refresh_token' }),
  });
  return (await r.json()).access_token;
}
async function adsQuery(env, at, query) {
  const r = await fetch(`https://googleads.googleapis.com/v21/customers/${CID}/googleAds:search`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN, Authorization: 'Bearer ' + at },
    body: JSON.stringify({ query }),
  });
  return (await r.json()).results || [];
}

async function computeSnapshot(env) {
  const DAYS = 7;
  const at = await token(env);
  const statusRows = await adsQuery(env, at, `SELECT campaign.status FROM campaign WHERE campaign.id=${CAMP}`);
  const status = statusRows[0]?.campaign?.status || 'UNKNOWN';
  const rows = await adsQuery(env, at, `SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE campaign.id=${CAMP} AND segments.date DURING LAST_${DAYS}_DAYS`);
  let impr = 0, clicks = 0, cost = 0, conv = 0;
  for (const r of rows) { const m = r.metrics; impr += +(m.impressions || 0); clicks += +(m.clicks || 0); cost += +(m.costMicros || 0); conv += +(m.conversions || 0); }

  const since = new Date(Date.now() - DAYS * 864e5).toISOString();
  const crmRes = await fetch(`${env.GLOBALCRM_URL}/rest/v1/contacts?select=id,source,gclid,pipeline_stages(name)&product=ilike.worksync&created_at=gte.${since}`, { headers: { apikey: env.GLOBALCRM_KEY, Authorization: 'Bearer ' + env.GLOBALCRM_KEY } });
  let crm = []; try { crm = await crmRes.json(); } catch {}
  const leads = (crm || []).filter((r) => r.source === 'Google Ads' || r.gclid);
  const byStage = {}; for (const r of leads) { const s = r.pipeline_stages?.name || '(no stage)'; byStage[s] = (byStage[s] || 0) + 1; }
  const demos = Object.entries(byStage).filter(([s]) => /demo (booked|scheduled|confirmed)|booked/i.test(s)).reduce((a, [, n]) => a + n, 0);

  const spend = cost / 1e6, ctr = impr ? clicks / impr * 100 : 0, cpl = leads.length ? spend / leads.length : 0, cpd = demos ? spend / demos : 0;
  const live = status === 'ENABLED';
  let diagClass, diagText, digest;
  if (!live) { diagClass = 'paused'; diagText = 'Campaign is PAUSED — flip Track 1 live to start collecting data.'; digest = 'Track 1 (Direct-response Search) is built and paused. Nothing has spent yet. Flip it live to begin the mechanics test — the funnel and this dashboard will populate within hours.'; }
  else if (impr === 0) { diagClass = 'warn'; diagText = 'No impressions yet → bids/keywords/volume. Fix targeting, not creative.'; digest = `Live, but zero impressions over ${DAYS}d. This is a targeting/volume issue (Indian B2B search volume is thin), not a creative one — raising bids / widening keywords.`; }
  else if (clicks === 0) { diagClass = 'warn'; diagText = 'Impressions but no clicks → the ad/angle. This is the "swap the track" case.'; digest = `${impr} impressions, 0 clicks. The ad itself isn't pulling — this is the one case where we swap the creative track.`; }
  else if (leads.length === 0) { diagClass = 'warn'; diagText = 'Clicks but no leads → landing/form or intake. Mechanics fix.'; digest = `${clicks} clicks but no leads. People arrive and don't convert — checking the landing form & intake, not the ad.`; }
  else if (demos === 0) { diagClass = 'warn'; diagText = 'Leads but no demos → dialer/booking step. Mechanics fix.'; digest = `${leads.length} lead(s) in, but no demo booked yet. Checking the Riya call → booking step.`; }
  else { diagClass = 'ok'; diagText = 'Full funnel firing — leads and demos flowing.'; digest = `Healthy: ${leads.length} leads → ${demos} demo(s) at ₹${cpd.toFixed(0)}/qualified demo. The machine works; next we add a challenger track.`; }

  return { generatedAt: new Date().toISOString(), days: DAYS, status, live, impr, clicks, spend, conv, leads: leads.length, byStage, demos, ctr, cpl, cpd, diagClass, diagText, digest };
}

function render(s) {
  const when = new Date(s.generatedAt);
  const ist = new Date(when.getTime() + 5.5 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' IST';
  const tile = (l, n, sub) => `<div class="fstage"><div class="fn">${n}</div><div class="fl">${l}</div><div class="fs">${sub || '&nbsp;'}</div></div>`;
  const kpi = (l, v, sub) => `<div class="kpi"><div class="kl">${l}</div><div class="kv">${v}</div><div class="ks">${sub || '&nbsp;'}</div></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WorkSync Acquisition</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}body{background:#0d0a18;color:#ece8f7;font-family:'Segoe UI',system-ui,Arial,sans-serif;padding:26px 22px;max-width:1120px;margin:0 auto}
.a{background:linear-gradient(90deg,#a78bfa,#f0abfc);-webkit-background-clip:text;background-clip:text;color:transparent}
.top{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}
h1{font-size:24px;font-weight:800}
.badge{font-size:12px;font-weight:800;padding:3px 11px;border-radius:999px;margin-left:8px}.enabled{background:#10b981;color:#062b1c}.paused{background:#f59e0b;color:#2a1d05}.unknown{background:#555;color:#fff}
.refresh{background:linear-gradient(90deg,#8b5cf6,#d946ef);color:#fff;text-decoration:none;font-weight:700;padding:9px 18px;border-radius:999px;font-size:14px}
.meta{color:#8a7eb0;font-size:13px;margin:4px 0 16px}
.digest{background:#161226;border:1px solid #2a2142;border-left:4px solid #a78bfa;border-radius:12px;padding:14px 18px;margin-bottom:18px}
.digest h3{font-size:13px;color:#c4b5fd;letter-spacing:.5px;margin-bottom:5px}.digest p{font-size:15px;line-height:1.5;color:#e4ddf5}
.diag{padding:11px 16px;border-radius:11px;margin-bottom:18px;font-size:14px;font-weight:600}
.diag.paused,.diag.warn{background:rgba(245,158,11,.14);border:1px solid #7a5a1f;color:#fcd9a3}.diag.ok{background:rgba(16,185,129,.14);border:1px solid #1f7a52;color:#a7f3d0}
.funnel{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px}
.fstage{background:#161226;border:1px solid #2a2142;border-radius:12px;padding:14px;text-align:center}
.fn{font-size:30px;font-weight:800}.fl{font-size:12px;color:#c4b5fd;margin-top:3px;text-transform:uppercase;letter-spacing:.4px}.fs{font-size:11px;color:#8a7eb0;margin-top:2px}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:18px}
.kpi{background:#13101f;border:1px solid #271f3f;border-radius:11px;padding:12px 14px}
.kl{font-size:11px;color:#9b8fc0;text-transform:uppercase}.kv{font-size:22px;font-weight:800;margin-top:3px}.ks{font-size:11px;color:#8a7eb0}
table{width:100%;border-collapse:collapse;background:#13101f;border:1px solid #271f3f;border-radius:11px;overflow:hidden}
th,td{text-align:left;padding:10px 14px;font-size:14px;border-bottom:1px solid #251d38}th{color:#9b8fc0;font-size:12px;text-transform:uppercase}
.foot{color:#6f5f99;font-size:12px;margin-top:16px}
@media(max-width:760px){.funnel,.kpis{grid-template-columns:repeat(2,1fr)}}
</style></head><body>
<div class="top"><h1>WorkSync — <span class="a">Acquisition</span><span class="badge ${s.live ? 'enabled' : (s.status === 'PAUSED' ? 'paused' : 'unknown')}">${s.status}</span></h1>
  <a class="refresh" href="/refresh">↻ Refresh now</a></div>
<div class="meta">Track 1 · Direct-response Search · last ${s.days} days &nbsp;•&nbsp; Last refreshed: ${ist} &nbsp;•&nbsp; auto-refreshes daily</div>
<div class="digest"><h3>TODAY'S READ</h3><p>${s.digest}</p></div>
<div class="diag ${s.diagClass}">${s.live ? '◷' : '⏸'} ${s.diagText}</div>
<div class="funnel">
  ${tile('Impressions', s.impr, '')}
  ${tile('Clicks', s.clicks, s.ctr ? s.ctr.toFixed(1) + '% CTR' : '')}
  ${tile('Leads', s.leads, s.leads ? '₹' + s.cpl.toFixed(0) + '/lead' : '')}
  ${tile('In calling', s.leads, 'Riya warm call')}
  ${tile('Demos', s.demos, s.demos ? '₹' + s.cpd.toFixed(0) + '/demo' : '')}
</div>
<div class="kpis">
  ${kpi('Spend', '₹' + s.spend.toFixed(0), 'last ' + s.days + 'd')}
  ${kpi('CTR', s.ctr.toFixed(1) + '%', s.clicks + ' clicks')}
  ${kpi('Cost / Lead', s.leads ? '₹' + s.cpl.toFixed(0) : '—', s.leads + ' leads')}
  ${kpi('Cost / Qualified Demo', s.demos ? '₹' + s.cpd.toFixed(0) : '—', 'the KPI')}
  ${kpi('Ads conversions', s.conv.toFixed(0), 'GA4 leads')}
</div>
<table><tr><th>Lead stage (from Google Ads)</th><th>Count</th></tr>
${Object.entries(s.byStage).map(([k, n]) => `<tr><td>${k}</td><td>${n}</td></tr>`).join('') || '<tr><td>No leads yet</td><td>0</td></tr>'}
</table>
<div class="foot">KPI = cost per qualified demo · data: Google Ads + globalcrm · refreshes once daily (cron) or on demand (Refresh now)</div>
</body></html>`;
}

export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    if (u.pathname === '/refresh') {
      const snap = await computeSnapshot(env);
      await env.DASH.put('snapshot', JSON.stringify(snap));
      return new Response(null, { status: 302, headers: { Location: '/' } });
    }
    let snap = await env.DASH.get('snapshot', { type: 'json' });
    if (!snap) { snap = await computeSnapshot(env); await env.DASH.put('snapshot', JSON.stringify(snap)); }
    return new Response(render(snap), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const snap = await computeSnapshot(env);
      await env.DASH.put('snapshot', JSON.stringify(snap));
    })());
  },
};
