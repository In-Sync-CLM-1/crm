/**
 * mkt-social-youtube — Upload blog video as a YouTube Short.
 *
 * Called by mkt-blog-poster after a successful LinkedIn post.
 * Uses YouTube Data API v3 resumable upload — streams the video from video_url
 * directly to YouTube without buffering the full file in memory.
 * Gracefully skips if video_url is not set on the blog post.
 *
 * Quota: each videos.insert costs ~1,600 units from 10,000/day free quota.
 * (~6 uploads/day on free tier)
 *
 * Required env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN
 * (YOUTUBE_REFRESH_TOKEN is the youtube.upload-scoped token; the generic
 * GOOGLE_REFRESH_TOKEN name is accepted as a fallback for compatibility.)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/corsHeaders.ts';

const YT_API = 'https://www.googleapis.com/youtube/v3';
const YT_UPLOAD_API = 'https://www.googleapis.com/upload/youtube/v3';
const QUOTA_PER_UPLOAD = 1600;
const PROCESSING_POLL_INTERVAL_MS = 30_000;
const PROCESSING_POLL_MAX = 10;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function err(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Exchange refresh token for a short-lived access token
async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('YOUTUBE_CLIENT_ID') || Deno.env.get('GOOGLE_CLIENT_ID') || '',
      client_secret: Deno.env.get('YOUTUBE_CLIENT_SECRET') || Deno.env.get('GOOGLE_CLIENT_SECRET') || '',
      refresh_token: Deno.env.get('YOUTUBE_REFRESH_TOKEN') || Deno.env.get('GOOGLE_REFRESH_TOKEN') || '',
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Token refresh ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (!data.access_token) throw new Error('No access_token in token response');
  return data.access_token as string;
}

// Initiate resumable upload — returns the upload URL
async function initiateUpload(
  accessToken: string,
  title: string,
  description: string,
  tags: string[],
  contentType: string,
): Promise<string> {
  const res = await fetch(
    `${YT_UPLOAD_API}/videos?uploadType=resumable&part=snippet,status`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': contentType,
      },
      body: JSON.stringify({
        snippet: {
          title: title.slice(0, 100),
          description: description.slice(0, 5000),
          tags: tags.slice(0, 500), // YT max 500 chars combined
          categoryId: '22', // People & Blogs
        },
        status: {
          privacyStatus: 'public',
          selfDeclaredMadeForKids: false,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!res.ok) throw new Error(`YT initiate upload ${res.status}: ${await res.text()}`);
  const uploadUrl = res.headers.get('Location');
  if (!uploadUrl) throw new Error('YT did not return upload URL');
  return uploadUrl;
}

// Stream video from source URL directly to YouTube (avoids loading full file in memory)
async function streamUpload(uploadUrl: string, videoUrl: string, accessToken: string): Promise<string> {
  // Fetch video source
  const videoRes = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) });
  if (!videoRes.ok) throw new Error(`Video source fetch ${videoRes.status}`);
  const contentType = videoRes.headers.get('Content-Type') || 'video/mp4';
  const contentLength = videoRes.headers.get('Content-Length');

  const uploadHeaders: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': contentType,
  };
  if (contentLength) uploadHeaders['Content-Length'] = contentLength;

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: uploadHeaders,
    body: videoRes.body,
    signal: AbortSignal.timeout(120_000),
  });

  if (!uploadRes.ok) throw new Error(`YT upload ${uploadRes.status}: ${await uploadRes.text()}`);
  const data = await uploadRes.json();
  if (!data.id) throw new Error(`YT upload response missing video id: ${JSON.stringify(data)}`);
  return data.id as string;
}

// Poll processingDetails until succeeded, failed, or timeout
// Non-blocking: called without await so function can return before polling completes
async function pollProcessing(videoId: string, accessToken: string): Promise<void> {
  for (let i = 0; i < PROCESSING_POLL_MAX; i++) {
    await sleep(PROCESSING_POLL_INTERVAL_MS);
    try {
      const res = await fetch(
        `${YT_API}/videos?part=processingDetails&id=${videoId}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(15_000),
        },
      );
      const data = await res.json();
      const status = data?.items?.[0]?.processingDetails?.processingStatus;
      console.log(`[social-youtube] processingStatus=${status} (poll ${i + 1})`);
      if (status === 'succeeded') return;
      if (status === 'failed') throw new Error(`YT processing failed for ${videoId}`);
    } catch (e) {
      console.warn(`[social-youtube] poll error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.warn(`[social-youtube] processing poll timed out — video ${videoId} may still be processing`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const clientId = Deno.env.get('YOUTUBE_CLIENT_ID') || Deno.env.get('GOOGLE_CLIENT_ID');
  const refreshToken = Deno.env.get('YOUTUBE_REFRESH_TOKEN') || Deno.env.get('GOOGLE_REFRESH_TOKEN');
  if (!clientId || !refreshToken) {
    // NOTE: this skip is silent by design for unconfigured channels — but the
    // credential IS expected here, so log loudly to make a regression visible.
    console.error('[social-youtube] SKIPPING — GOOGLE_CLIENT_ID or YOUTUBE_REFRESH_TOKEN missing');
    return ok({ skip: 'GOOGLE_CLIENT_ID or YOUTUBE_REFRESH_TOKEN not configured' });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const { blog_post_id } = body;
    if (!blog_post_id) return err(400, 'blog_post_id required');

    const { data: post, error: postErr } = await supabase
      .from('blog_posts')
      .select('id, blog_title, blog_excerpt, blog_url, video_url, yt_video_id')
      .eq('id', blog_post_id)
      .maybeSingle();

    if (postErr) return err(500, postErr.message);
    if (!post) return err(404, 'Blog post not found');

    if (!post.video_url) {
      return ok({ skip: 'no video_url on blog post' });
    }

    // Already on the channel — the promo posts carry a hand-uploaded video id,
    // and a retried fan-out would otherwise upload a second copy (and burn
    // another ~1600 units of the daily quota).
    if (post.yt_video_id) {
      return ok({ skip: 'already uploaded to YouTube', yt_video_id: post.yt_video_id });
    }

    const accessToken = await getAccessToken();

    const description = [
      post.blog_excerpt || '',
      post.blog_url ? `\n\nRead the full article: ${post.blog_url}` : '',
    ].join('').trim();

    const tags = ['B2BSaaS', 'InSync', 'BusinessGrowth', 'Shorts'];

    // Initiate resumable upload
    const uploadUrl = await initiateUpload(
      accessToken,
      post.blog_title as string,
      description,
      tags,
      'video/mp4',
    );

    // Stream video to YouTube
    const videoId = await streamUpload(uploadUrl, post.video_url as string, accessToken);
    console.log(`[social-youtube] uploaded: ${videoId} (quota used: ~${QUOTA_PER_UPLOAD})`);

    // Persist to DB
    await supabase
      .from('blog_posts')
      .update({ yt_video_id: videoId, yt_posted_at: new Date().toISOString() })
      .eq('id', post.id);

    // Poll processing status in background — don't block response
    pollProcessing(videoId, accessToken).catch((e) =>
      console.warn('[social-youtube] processing poll error:', e instanceof Error ? e.message : String(e))
    );

    return ok({ success: true, yt_video_id: videoId, quota_used: QUOTA_PER_UPLOAD });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[social-youtube] fatal:', msg);
    return err(500, msg);
  }
});
