/**
 * X (Twitter) API client — OAuth 1.0a user-context signing with the four
 * X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET secrets.
 *
 * Pay-per-use billing notes (X free tier is discontinued):
 * - a write costs $0.015, but $0.20 when the post text contains a URL —
 *   callers must strip links from post text; the profile bio carries the site.
 * - reads on our own content are cheap; the engagement tracker batches them.
 */

export interface XCreds {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

export function getXCreds(): XCreds | null {
  const apiKey = Deno.env.get('X_API_KEY');
  const apiSecret = Deno.env.get('X_API_SECRET');
  const accessToken = Deno.env.get('X_ACCESS_TOKEN');
  const accessSecret = Deno.env.get('X_ACCESS_TOKEN_SECRET');
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) return null;
  return { apiKey, apiSecret, accessToken, accessSecret };
}

const pct = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

async function hmacSha1(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/**
 * Builds the Authorization header. `extraParams` must contain every query /
 * form-urlencoded parameter of the request (multipart bodies and JSON bodies
 * are excluded from OAuth 1.0a signatures by spec).
 */
export async function oauth1Header(
  method: string,
  baseUrl: string,
  creds: XCreds,
  extraParams: Record<string, string> = {},
): Promise<string> {
  const oauth: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  };
  const all = { ...oauth, ...extraParams };
  const paramString = Object.keys(all).sort().map((k) => `${pct(k)}=${pct(all[k])}`).join('&');
  const base = [method.toUpperCase(), pct(baseUrl), pct(paramString)].join('&');
  oauth.oauth_signature = await hmacSha1(`${pct(creds.apiSecret)}&${pct(creds.accessSecret)}`, base);
  return 'OAuth ' + Object.keys(oauth).sort().map((k) => `${pct(k)}="${pct(oauth[k])}"`).join(', ');
}

export async function postTweet(text: string, mediaIds: string[], creds: XCreds): Promise<string> {
  const url = 'https://api.twitter.com/2/tweets';
  const payload: Record<string, unknown> = { text };
  if (mediaIds.length) payload.media = { media_ids: mediaIds };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': await oauth1Header('POST', url, creds),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`X POST /2/tweets ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (!data?.data?.id) throw new Error(`X post response missing id: ${JSON.stringify(data)}`);
  return data.data.id as string;
}

export async function deleteTweet(id: string, creds: XCreds): Promise<void> {
  const url = `https://api.twitter.com/2/tweets/${id}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Authorization': await oauth1Header('DELETE', url, creds) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`X DELETE tweet ${res.status}: ${await res.text()}`);
}

const UPLOAD_URL = 'https://upload.twitter.com/1.1/media/upload.json';

/** Simple (single-shot) image upload. Multipart body → nothing extra to sign. */
export async function uploadImage(imageUrl: string, creds: XCreds): Promise<string> {
  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!imgRes.ok) throw new Error(`image fetch ${imgRes.status} for ${imageUrl}`);
  const blob = await imgRes.blob();

  const form = new FormData();
  form.append('media', blob);
  const res = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: { 'Authorization': await oauth1Header('POST', UPLOAD_URL, creds) },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`X media upload ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.media_id_string as string;
}

/** Chunked video upload (INIT → APPEND → FINALIZE → poll STATUS). */
export async function uploadVideo(videoUrl: string, creds: XCreds): Promise<string> {
  const vidRes = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) });
  if (!vidRes.ok) throw new Error(`video fetch ${vidRes.status} for ${videoUrl}`);
  const bytes = new Uint8Array(await vidRes.arrayBuffer());

  const initForm = new FormData();
  initForm.append('command', 'INIT');
  initForm.append('media_type', 'video/mp4');
  initForm.append('total_bytes', String(bytes.length));
  initForm.append('media_category', 'tweet_video');
  const initRes = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: { 'Authorization': await oauth1Header('POST', UPLOAD_URL, creds) },
    body: initForm,
    signal: AbortSignal.timeout(30_000),
  });
  if (!initRes.ok) throw new Error(`X video INIT ${initRes.status}: ${await initRes.text()}`);
  const mediaId = (await initRes.json()).media_id_string as string;

  const CHUNK = 4 * 1024 * 1024;
  for (let i = 0, seg = 0; i < bytes.length; i += CHUNK, seg++) {
    const form = new FormData();
    form.append('command', 'APPEND');
    form.append('media_id', mediaId);
    form.append('segment_index', String(seg));
    form.append('media', new Blob([bytes.slice(i, i + CHUNK)]));
    const res = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { 'Authorization': await oauth1Header('POST', UPLOAD_URL, creds) },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`X video APPEND seg ${seg} ${res.status}: ${await res.text()}`);
  }

  const finForm = new FormData();
  finForm.append('command', 'FINALIZE');
  finForm.append('media_id', mediaId);
  const finRes = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: { 'Authorization': await oauth1Header('POST', UPLOAD_URL, creds) },
    body: finForm,
    signal: AbortSignal.timeout(30_000),
  });
  if (!finRes.ok) throw new Error(`X video FINALIZE ${finRes.status}: ${await finRes.text()}`);
  let info = (await finRes.json()).processing_info;

  while (info && (info.state === 'pending' || info.state === 'in_progress')) {
    await new Promise((r) => setTimeout(r, (info.check_after_secs ?? 3) * 1000));
    const params = { command: 'STATUS', media_id: mediaId };
    const url = `${UPLOAD_URL}?command=STATUS&media_id=${mediaId}`;
    const res = await fetch(url, {
      headers: { 'Authorization': await oauth1Header('GET', UPLOAD_URL, creds, params) },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`X video STATUS ${res.status}: ${await res.text()}`);
    info = (await res.json()).processing_info;
  }
  if (info?.state === 'failed') throw new Error(`X video processing failed: ${JSON.stringify(info.error ?? info)}`);
  return mediaId;
}

/** Own account profile — followers_count for the daily channel snapshot. */
export async function getOwnProfile(creds: XCreds): Promise<{ screenName: string; followers: number } | null> {
  const url = 'https://api.twitter.com/1.1/account/verify_credentials.json';
  const res = await fetch(url, {
    headers: { 'Authorization': await oauth1Header('GET', url, creds) },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    console.warn(`[xClient] verify_credentials ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  const d = await res.json();
  return { screenName: d.screen_name as string, followers: (d.followers_count as number) ?? 0 };
}

export interface TweetMetrics {
  impressions: number;
  likes: number;
  replies: number;
  reposts: number;
}

/** Batch public metrics for our own tweets (up to 100 ids per call). */
export async function getTweetMetrics(ids: string[], creds: XCreds): Promise<Record<string, TweetMetrics>> {
  const out: Record<string, TweetMetrics> = {};
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const params = { ids: batch.join(','), 'tweet.fields': 'public_metrics' };
    const baseUrl = 'https://api.twitter.com/2/tweets';
    const url = `${baseUrl}?ids=${encodeURIComponent(params.ids)}&tweet.fields=public_metrics`;
    const res = await fetch(url, {
      headers: { 'Authorization': await oauth1Header('GET', baseUrl, creds, params) },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn(`[xClient] tweets lookup ${res.status}: ${(await res.text()).slice(0, 200)}`);
      continue;
    }
    const data = await res.json();
    for (const t of data.data ?? []) {
      const m = t.public_metrics ?? {};
      out[t.id] = {
        impressions: m.impression_count ?? 0,
        likes: m.like_count ?? 0,
        replies: m.reply_count ?? 0,
        reposts: (m.retweet_count ?? 0) + (m.quote_count ?? 0),
      };
    }
  }
  return out;
}
