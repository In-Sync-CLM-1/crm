/**
 * mkt-social-instagram — Publish image posts and Reels to Instagram Business account.
 *
 * Called by mkt-blog-poster after a successful LinkedIn post.
 * Uses the two-step Meta container publish flow for both image posts and Reels.
 * Gracefully skips if image_url / video_url is not set on the blog post.
 *
 * IG user ID + Page access token come from mkt_social_config, populated by
 * mkt-facebook-oauth-callback — shared Meta app with Facebook, same token.
 */
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

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

// Carousel post — all slides as one swipeable IG carousel (max 10 children),
// mirroring the Facebook album fix: LinkedIn gets the full document, so the
// other channels must not silently truncate to the cover slide.
async function publishCarouselPost(
  igUserId: string,
  token: string,
  imageUrls: string[],
  caption: string,
): Promise<string> {
  // Step 1: create child containers concurrently
  const children = await Promise.all(
    imageUrls.slice(0, 10).map(async (url) => {
      const res = await fetch(`https://graph.facebook.com/${FB_API_VERSION}/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: url, is_carousel_item: true, access_token: token }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`IG carousel child ${res.status}: ${await res.text()}`);
      const { id } = await res.json();
      return id as string;
    }),
  );

  // Step 2: wait for every child to finish processing
  await Promise.all(children.map((id) => awaitContainer(id, token)));

  // Step 3: create + publish the carousel container
  const res = await fetch(`https://graph.facebook.com/${FB_API_VERSION}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'CAROUSEL',
      children: children.join(','),
      caption,
      access_token: token,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`IG carousel container ${res.status}: ${await res.text()}`);
  const { id: containerId } = await res.json();
  await awaitContainer(containerId, token);
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

  const supabase = getSupabaseClient();

  try {
    const { data: socialConfig } = await supabase
      .from('mkt_social_config')
      .select('ig_user_id, fb_page_access_token')
      .eq('active', true)
      .maybeSingle();

    const igUserId = socialConfig?.ig_user_id;
    const token = socialConfig?.fb_page_access_token;
    if (!igUserId || !token) {
      return ok({ skip: 'Instagram not connected — no ig_user_id/fb_page_access_token on mkt_social_config' });
    }

    const body = await req.json().catch(() => ({}));
    const { blog_post_id } = body;
    if (!blog_post_id) return err(400, 'blog_post_id required');

    const { data: post, error: postErr } = await supabase
      .from('blog_posts')
      .select('id, blog_title, blog_excerpt, linkedin_short_caption, post_format, image_url, video_url, carousel_slide_urls')
      .eq('id', blog_post_id)
      .maybeSingle();

    if (postErr) return err(500, postErr.message);
    if (!post) return err(404, 'Blog post not found');

    const result: Record<string, unknown> = {};
    // IG caption: short caption preferred (max 2200 chars)
    const caption = ((post.linkedin_short_caption || post.blog_excerpt || post.blog_title) as string).slice(0, 2200);
    const slides = Array.isArray(post.carousel_slide_urls)
      ? (post.carousel_slide_urls as string[]).filter(Boolean)
      : [];

    // ── Carousel post ───────────────────────────────────────────────────────
    if (post.post_format === 'carousel' && slides.length > 1) {
      try {
        const mediaId = await publishCarouselPost(igUserId, token, slides, caption);
        await supabase
          .from('blog_posts')
          .update({ ig_post_id: mediaId, ig_posted_at: new Date().toISOString() })
          .eq('id', post.id);
        result.ig_post_id = mediaId;
        console.log(`[social-instagram] carousel posted: ${mediaId}`);
      } catch (e) {
        console.warn('[social-instagram] carousel failed, falling back to cover image:', e instanceof Error ? e.message : e);
        try {
          const mediaId = await publishImagePost(igUserId, token, slides[0], caption);
          await supabase
            .from('blog_posts')
            .update({ ig_post_id: mediaId, ig_posted_at: new Date().toISOString() })
            .eq('id', post.id);
          result.ig_post_id = mediaId;
        } catch (e2) {
          result.image_error = e2 instanceof Error ? e2.message : String(e2);
          console.error('[social-instagram] carousel fallback failed:', result.image_error);
        }
      }
    } else if (post.image_url) {
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
