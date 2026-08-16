/**
 * mkt-social-facebook — Post blog content to the Facebook company Page.
 *
 * Called by mkt-blog-poster after a successful LinkedIn post. Mirrors
 * mkt-social-instagram's approach: read whatever media the post actually
 * carries (image_url / video_url / carousel_slide_urls) and post that,
 * rather than depending on a "published blog article" URL that the current
 * content pipeline no longer produces.
 *
 * Page ID + Page access token come from mkt_social_config (System User
 * Page token, generated in Meta Business Settings — see
 * mkt-facebook-oauth-callback for the OAuth alternative).
 */
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const FB_API_VERSION = 'v19.0';

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

async function postWithRetry(url: string, params: Record<string, unknown>): Promise<{ id: string }> {
  const doPost = () =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(30_000),
    });

  let res = await doPost();
  if (res.status === 429) {
    console.warn('[social-facebook] rate limited — retrying in 5s');
    await sleep(5_000);
    res = await doPost();
  }
  if (!res.ok) throw new Error(`FB Graph API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function postText(pageId: string, token: string, message: string): Promise<string> {
  const data = await postWithRetry(`https://graph.facebook.com/${FB_API_VERSION}/${pageId}/feed`, {
    message,
    access_token: token,
  });
  return data.id;
}

async function postPhoto(pageId: string, token: string, imageUrl: string, caption: string): Promise<string> {
  const data = await postWithRetry(`https://graph.facebook.com/${FB_API_VERSION}/${pageId}/photos`, {
    url: imageUrl,
    caption,
    access_token: token,
  });
  return data.id;
}

// Carousel as a proper multi-photo album post — LinkedIn gets all slides as a
// swipeable document, so Facebook must show all of them too, not just the
// cover. Photos are uploaded unpublished, then attached to one feed post.
async function postMultiPhoto(pageId: string, token: string, imageUrls: string[], message: string): Promise<string> {
  const mediaIds: string[] = [];
  for (const url of imageUrls) {
    const data = await postWithRetry(`https://graph.facebook.com/${FB_API_VERSION}/${pageId}/photos`, {
      url,
      published: 'false',
      access_token: token,
    });
    mediaIds.push(data.id);
  }
  const data = await postWithRetry(`https://graph.facebook.com/${FB_API_VERSION}/${pageId}/feed`, {
    message,
    attached_media: mediaIds.map((id) => ({ media_fbid: id })),
    access_token: token,
  });
  return data.id;
}

async function postVideo(pageId: string, token: string, videoUrl: string, description: string): Promise<string> {
  const data = await postWithRetry(`https://graph.facebook.com/${FB_API_VERSION}/${pageId}/videos`, {
    file_url: videoUrl,
    description,
    access_token: token,
  });
  return data.id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = getSupabaseClient();

  try {
    const { data: socialConfig } = await supabase
      .from('mkt_social_config')
      .select('fb_page_id, fb_page_access_token')
      .eq('active', true)
      .maybeSingle();

    const pageId = socialConfig?.fb_page_id;
    const token = socialConfig?.fb_page_access_token;
    if (!pageId || !token) {
      return ok({ skip: 'Facebook not connected — no fb_page_id/fb_page_access_token on mkt_social_config' });
    }

    const body = await req.json().catch(() => ({}));
    const { blog_post_id } = body;
    if (!blog_post_id) return err(400, 'blog_post_id required');

    const { data: post, error: postErr } = await supabase
      .from('blog_posts')
      .select('id, channel, blog_title, blog_excerpt, linkedin_draft_text, linkedin_short_caption, post_format, image_url, video_url, carousel_slide_urls')
      .eq('id', blog_post_id)
      .maybeSingle();

    if (postErr) return err(500, postErr.message);
    if (!post) return err(404, 'Blog post not found');

    // Facebook always gets the short caption — long LinkedIn text collapses
    // behind "See more" and reads out of place there.
    // Persona posts (founder's first-person stream) cross-post to the Page
    // with explicit founder attribution, and use the full post text.
    const isPersona = post.channel === 'member';
    const rawMessage = isPersona
      ? `From our founder, Amit:\n\n${(post.linkedin_draft_text || post.blog_excerpt || '') as string}`
      : ((post.linkedin_short_caption || post.blog_excerpt || post.blog_title) as string || '');
    const message = rawMessage.slice(0, 63_000);
    const slides = Array.isArray(post.carousel_slide_urls)
      ? (post.carousel_slide_urls as string[]).filter(Boolean)
      : [];

    let fbPostId: string;
    if (post.post_format === 'carousel' && slides.length > 1) {
      fbPostId = await postMultiPhoto(pageId, token, slides, message).catch(async (e) => {
        console.warn('[social-facebook] multi-photo failed, falling back to cover photo:', e instanceof Error ? e.message : e);
        return await postPhoto(pageId, token, slides[0], message);
      });
    } else if (post.video_url) {
      fbPostId = await postVideo(pageId, token, post.video_url as string, message);
    } else if (post.image_url) {
      fbPostId = await postPhoto(pageId, token, post.image_url as string, message);
    } else if (slides.length) {
      fbPostId = await postPhoto(pageId, token, slides[0], message);
    } else {
      fbPostId = await postText(pageId, token, message);
    }
    console.log(`[social-facebook] posted (format=${post.post_format}): ${fbPostId}`);

    await supabase
      .from('blog_posts')
      .update({ fb_post_id: fbPostId, fb_posted_at: new Date().toISOString() })
      .eq('id', post.id);

    return ok({ success: true, fb_post_id: fbPostId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[social-facebook] fatal:', msg);
    return err(500, msg);
  }
});
