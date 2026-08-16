/**
 * mkt-social-x — cross-post a blog_posts row to X (@insyncclm).
 *
 * Called by mkt-blog-poster after a successful LinkedIn post (company channel
 * only — the founder persona stream stays LinkedIn+FB). Media by format:
 * image → 1 photo, carousel → first 4 slides (X's per-post max), video →
 * chunked upload. Text is ALWAYS link-free: a URL in the text multiplies the
 * pay-per-use write cost ~13x ($0.015 → $0.20); the bio carries the site.
 *
 * Body {"smoke":true} posts one branded line and deletes it — verifies the
 * deployed signing/billing path without leaving anything on the timeline.
 */
import { getXCreds, postTweet, deleteTweet, uploadImage, uploadVideo } from '../_shared/xClient.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const MAX_LEN = 275;

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

/** Link-free, X-length text from whatever the row offers. */
export function buildTweetText(shortCaption: string | null, draftText: string | null, title: string): string {
  let src = (shortCaption?.trim() || draftText?.trim() || title).replace(/\r/g, '');

  // The long-form drafts open with the hook before the first divider — that
  // hook IS the tweet.
  const divider = src.indexOf('───');
  if (divider > 60) src = src.slice(0, divider);

  src = src
    .replace(/https?:\/\/\S+/g, '')            // never a URL (13x write cost)
    .replace(/link in (the )?comments\.?/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (src.length <= MAX_LEN) return src;
  const cut = src.slice(0, MAX_LEN);
  const lastBreak = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'), cut.lastIndexOf(' '));
  return cut.slice(0, lastBreak > 100 ? lastBreak : MAX_LEN).trimEnd() + '…';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const creds = getXCreds();
  if (!creds) return ok({ skip: 'X credentials not configured' });

  const supabase = getSupabaseClient();

  try {
    const body = await req.json().catch(() => ({}));

    if (body?.smoke === true) {
      const id = await postTweet('Run your entire business on one platform. Built for Indian SMBs.', [], creds);
      await deleteTweet(id, creds);
      return ok({ smoke: true, posted_and_deleted: id });
    }

    const { blog_post_id } = body;
    if (!blog_post_id) return err(400, 'blog_post_id required');

    const { data: post, error: postErr } = await supabase
      .from('blog_posts')
      .select('id, channel, post_format, blog_title, linkedin_short_caption, linkedin_draft_text, image_url, video_url, carousel_slide_urls, x_post_id')
      .eq('id', blog_post_id)
      .maybeSingle();
    if (postErr) return err(500, postErr.message);
    if (!post) return err(404, 'blog post not found');
    if (post.channel === 'member') return ok({ skip: 'persona posts do not fan out to X' });
    if (post.x_post_id) return ok({ skip: 'already posted to X', x_post_id: post.x_post_id });

    const text = buildTweetText(
      post.linkedin_short_caption as string | null,
      post.linkedin_draft_text as string | null,
      post.blog_title as string,
    );

    const mediaIds: string[] = [];
    try {
      if (post.post_format === 'video' && post.video_url) {
        mediaIds.push(await uploadVideo(post.video_url as string, creds));
      } else if (post.post_format === 'carousel' && Array.isArray(post.carousel_slide_urls) && post.carousel_slide_urls.length) {
        for (const slideUrl of (post.carousel_slide_urls as string[]).slice(0, 4)) {
          mediaIds.push(await uploadImage(slideUrl, creds));
        }
      } else if (post.image_url) {
        mediaIds.push(await uploadImage(post.image_url as string, creds));
      }
    } catch (mediaErr) {
      // Text still carries the post — degrade like the FB/IG posters do.
      console.warn(`[social-x] media upload failed, posting text-only: ${mediaErr instanceof Error ? mediaErr.message : mediaErr}`);
      mediaIds.length = 0;
    }

    const tweetId = await postTweet(text, mediaIds, creds);

    await supabase
      .from('blog_posts')
      .update({ x_post_id: tweetId, x_posted_at: new Date().toISOString() })
      .eq('id', post.id);

    console.log(`[social-x] posted ${tweetId} (${mediaIds.length} media) for blog post ${post.id}`);
    return ok({ success: true, x_post_id: tweetId, media_count: mediaIds.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[social-x] fatal:', msg);
    return err(500, msg);
  }
});
