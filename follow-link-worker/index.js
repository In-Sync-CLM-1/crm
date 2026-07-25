/**
 * go.in-sync.co.in — link handler for the founder follow-request campaign.
 *
 * Routes, all keyed by the opaque per-recipient token:
 *   GET  /f/<token>  follow click   → LinkedIn company page   (the conversion)
 *   GET  /p/<token>  post read      → the founder's LinkedIn post (interest)
 *   GET  /b/<token>  facebook click → Facebook page
 *   GET  /u/<token>  unsubscribe (confirmation page)
 *   POST /u/<token>  one-click unsubscribe (RFC 8058 List-Unsubscribe-Post)
 *
 * The three click types are counted separately because they mean different
 * things: a post read is interest, a follow click is the goal. Only a follow
 * click moves the row to 'clicked' and suppresses the reminder — someone who
 * read the post but didn't follow is exactly who the reminder is for.
 *
 * Why a Worker on our own domain instead of pointing the button straight at the
 * function URL: a cold email whose only link goes to <ref>.supabase.co reads as
 * phishing to both the recipient and the spam filters. This keeps every link on
 * in-sync.co.in, which is the same domain the mail is signed by.
 *
 * Redirect happens even if the click write fails — a tracking problem must
 * never cost the recipient the thing they clicked for.
 */

const LINKEDIN_PAGE = 'https://www.linkedin.com/company/insyncclm/';
const PROOF_POST =
  'https://www.linkedin.com/posts/trgxtrainingexchange_6-7-lakh-a-month-thats-what-building-activity-7486190600501813248-9QKW';
const FACEBOOK_PAGE = 'https://www.facebook.com/122129596563175408';
const TABLE = 'mkt_follow_campaign';

// Which destination each route sends to, and which columns it stamps.
const CLICK_ROUTES = {
  f: { url: LINKEDIN_PAGE, at: 'clicked_at', count: 'click_count', converts: true },
  p: { url: PROOF_POST, at: 'post_clicked_at', count: 'post_click_count', converts: false },
  b: { url: FACEBOOK_PAGE, at: 'fb_clicked_at', count: 'fb_click_count', converts: false },
};

// Link scanners in mail gateways fetch every URL before the human sees it.
// Counting those as clicks would make the campaign look successful when nobody
// has actually done anything, so they are recorded but flagged, not counted.
const BOT_UA = /bot|crawl|spider|preview|scan|monitor|curl|wget|python|java|go-http|headless|slurp|fetch|proofpoint|mimecast|barracuda|symantec|forcepoint|microsoft office|ms-office|outlook|skypeuripreview|bingpreview|facebookexternalhit|whatsapp|telegram/i;

function rest(env, path, init = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

async function loadRow(env, token) {
  const r = await rest(
    env,
    `${TABLE}?token=eq.${encodeURIComponent(token)}` +
      `&select=id,org_id,email,status,click_count,clicked_at,post_click_count,post_clicked_at,fb_click_count,fb_clicked_at&limit=1`,
  );
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function patch(env, id, body) {
  return rest(env, `${TABLE}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
}

function page(title, message) {
  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;font-family:-apple-system,'Segoe UI',Arial,sans-serif;background:#f9fafb;">
<div style="max-width:480px;margin:14vh auto;padding:32px 28px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;">
<h1 style="margin:0 0 12px;font-size:19px;color:#111827;">${title}</h1>
<p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">${message}</p>
</div></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}

async function handleClick(env, kind, token, req) {
  const route = CLICK_ROUTES[kind];
  const row = await loadRow(env, token);
  if (row) {
    const isBot = BOT_UA.test(req.headers.get('user-agent') || '');
    if (!isBot) {
      // Never downgrade a terminal state (unsubscribed/complained/bounced) —
      // a scanner-then-human sequence shouldn't resurrect a dead address.
      const keepStatus = ['unsubscribed', 'complained', 'bounced'].includes(row.status);
      await patch(env, row.id, {
        // Only the follow click is a conversion; a post read leaves the row
        // eligible for its reminder.
        ...(route.converts && !keepStatus ? { status: 'clicked' } : {}),
        [route.at]: row[route.at] || new Date().toISOString(),
        [route.count]: (row[route.count] || 0) + 1,
      });
    }
  }
  return Response.redirect(route.url, 302);
}

async function handleUnsubscribe(env, token, oneClick) {
  const row = await loadRow(env, token);
  if (!row) {
    return page('Link not recognised', 'This link has expired or is not valid. No further email will be sent to you from this campaign.');
  }

  const now = new Date().toISOString();
  await patch(env, row.id, { status: 'unsubscribed', unsubscribed_at: now });

  // Also write the fleet-wide suppression list, so no other In-Sync marketing
  // path can ever pick this address up again.
  await rest(env, 'mkt_unsubscribes?on_conflict=org_id,email,channel', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      org_id: row.org_id,
      email: row.email,
      channel: 'email',
      reason: 'follow_request_unsubscribe',
      unsubscribed_at: now,
      updated_at: now,
    }),
  });

  if (oneClick) return new Response(null, { status: 200 });
  return page('Done — you\'re removed', 'You won\'t receive any further email from us. Nothing else was needed on your part.');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/([fpbu])\/([A-Za-z0-9_-]{8,80})\/?$/);

    if (!m) {
      // Anything else on this host: send humans to the site, tell bots nothing.
      return Response.redirect('https://in-sync.co.in/', 302);
    }

    const [, kind, token] = m;

    try {
      if (kind !== 'u') {
        if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
        return await handleClick(env, kind, token, req);
      }
      return await handleUnsubscribe(env, token, req.method === 'POST');
    } catch (e) {
      // Fail toward the user's intent: the click still reaches its destination.
      if (kind !== 'u') return Response.redirect(CLICK_ROUTES[kind].url, 302);
      return page('Something went wrong', 'We could not process that just now. Reply to the email and we will remove you by hand.');
    }
  },
};
