/**
 * mkt-social-facebook — Post blog content to Facebook company page.
 *
 * Called by mkt-blog-poster after a successful LinkedIn post.
 * Posts blog title + excerpt as the message with the blog URL as the link.
 * Facebook auto-generates the OG link preview.
 *
 * Page ID + Page access token come from mkt_social_config, populated by
 * mkt-facebook-oauth-callback (Meta connect flow).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/corsHeaders.ts';

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

async function postToFacebook(
  pageId: string,
  token: string,
  message: string,
  link: string,
): Promise<string> {
  const doPost = () =>
    fetch(`https://graph.facebook.com/${FB_API_VERSION}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, link, access_token: token }),
      signal: AbortSignal.timeout(25_000),
    });

  let res = await doPost();
  // Retry once on rate limit
  if (res.status === 429) {
    console.warn('[social-facebook] rate limited — retrying in 5s');
    await sleep(5_000);
    res = await doPost();
  }

  if (!res.ok) throw new Error(`FB Graph API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.id as string; // format: {page-id}_{post-id}
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

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
      .select('id, blog_title, blog_excerpt, blog_url')
      .eq('id', blog_post_id)
      .maybeSingle();

    if (postErr) return err(500, postErr.message);
    if (!post) return err(404, 'Blog post not found');
    if (!post.blog_url || post.blog_url.startsWith('draft://')) {
      return ok({ skip: 'No public URL yet — post still a draft' });
    }

    const message = [post.blog_title, post.blog_excerpt]
      .filter(Boolean)
      .join('\n\n');

    const fbPostId = await postToFacebook(pageId, token, message, post.blog_url);
    console.log(`[social-facebook] posted: ${fbPostId}`);

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
