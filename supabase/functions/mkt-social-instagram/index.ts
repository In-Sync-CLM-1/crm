/**
 * mkt-social-instagram — Publish image posts and Reels to Instagram Business account.
 *
 * Called by mkt-blog-poster after a successful LinkedIn post.
 * Uses the two-step Meta container publish flow for both image posts and Reels.
 * Gracefully skips if image_url / video_url is not set on the blog post.
 *
 * Required env vars: IG_USER_ID, FB_PAGE_ACCESS_TOKEN
 * Shared Meta app with Facebook — no separate credentials needed.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/corsHeaders.ts';

const FB_API_VERSION = 'v19.0';
const POLL_INTERVAL_MS = 10_000;
const POLL_MAX_ATTEMPTS = 5;

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

// Poll container until FINISHED, ERROR, or timeout
async function awaitContainer(containerId: string, token: string): Promise<void> {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    await sleep(POLL_INTERVAL_MS);
    const res = await fetch(
      `https://graph.facebook.com/${FB_API_VERSION}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    const data = await res.json();
    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR') {
      throw new Error(`IG container error: ${JSON.stringify(data)}`);
    }
    console.log(`[social-instagram] container ${containerId} status: ${data.status_code} (attempt ${i + 1})`);
  }
  throw new Error(`IG container ${containerId} did not reach FINISHED after ${POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`);
}

async function publishContainer(igUserId: string, containerId: string, token: string): Promise<string> {
  const res = await fetch(`https://graph.facebook.com/${FB_API_VERSION}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: containerId, access_token: token }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`IG publish ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.id as string;
}

async function publishImagePost(
  igUserId: string,
  token: string,
  imageUrl: string,
  caption: string,
): Promise<string> {
  // Step 1: Create image container
  const res = await fetch(`https://graph.facebook.com/${FB_API_VERSION}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, caption, access_token: token }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`IG image container ${res.status}: ${await res.text()}`);
  const { id: containerId } = await res.json();

  // Step 2: Poll for FINISHED
  await awaitContainer(containerId, token);

  // Step 3: Publish
  return publishContainer(igUserId, containerId, token);
}

async function publishReel(
  igUserId: string,
  token: string,
  videoUrl: string,
  caption: string,
): Promise<string> {
  // Step 1: Create Reels container
  const res = await fetch(`https://graph.facebook.com/${FB_API_VERSION}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      share_to_feed: true,
      access_token: token,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`IG reel container ${res.status}: ${await res.text()}`);
  const { id: containerId } = await res.json();

  // Step 2: Poll for FINISHED (Reels encoding takes longer — more attempts)
  await awaitContainer(containerId, token);

  // Step 3: Publish
  return publishContainer(igUserId, containerId, token);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const igUserId = Deno.env.get('IG_USER_ID');
  const token = Deno.env.get('FB_PAGE_ACCESS_TOKEN');
  if (!igUserId || !token) {
    return ok({ skip: 'IG_USER_ID or FB_PAGE_ACCESS_TOKEN not configured' });
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
      .select('id, blog_title, blog_excerpt, image_url, video_url')
      .eq('id', blog_post_id)
      .maybeSingle();

    if (postErr) return err(500, postErr.message);
    if (!post) return err(404, 'Blog post not found');

    const result: Record<string, unknown> = {};
    // IG caption: use excerpt for brevity (max 2200 chars)
    const caption = ((post.blog_excerpt || post.blog_title) as string).slice(0, 2200);

    // ── Image post ──────────────────────────────────────────────────────────
    if (post.image_url) {
      try {
        const mediaId = await publishImagePost(igUserId, token, post.image_url as string, caption);
        await supabase
          .from('blog_posts')
          .update({ ig_post_id: mediaId, ig_posted_at: new Date().toISOString() })
          .eq('id', post.id);
        result.ig_post_id = mediaId;
        console.log(`[social-instagram] image posted: ${mediaId}`);
      } catch (e) {
        result.image_error = e instanceof Error ? e.message : String(e);
        console.error('[social-instagram] image post failed:', result.image_error);
      }
    } else {
      result.image_skipped = 'no image_url on blog post';
    }

    // ── Reel ────────────────────────────────────────────────────────────────
    if (post.video_url) {
      try {
        const reelId = await publishReel(igUserId, token, post.video_url as string, caption);
        await supabase
          .from('blog_posts')
          .update({ ig_reel_id: reelId, ig_posted_at: new Date().toISOString() })
          .eq('id', post.id);
        result.ig_reel_id = reelId;
        console.log(`[social-instagram] reel posted: ${reelId}`);
      } catch (e) {
        result.reel_error = e instanceof Error ? e.message : String(e);
        console.error('[social-instagram] reel failed:', result.reel_error);
      }
    } else {
      result.reel_skipped = 'no video_url on blog post';
    }

    return ok({ success: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[social-instagram] fatal:', msg);
    return err(500, msg);
  }
});
