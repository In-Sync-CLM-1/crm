/**
 * mkt-social-engagement-tracker — Daily sweep of Facebook + Instagram
 * engagement for recently posted content.
 *
 * Unlike LinkedIn (partner-gated; its tracker records NULL = unknown), Meta
 * returns real metrics with the standard Page token. Metrics are cumulative,
 * so posts from the last 14 days are re-read every sweep and the latest value
 * simply overwrites the previous one.
 *
 * Facebook: likes/comments/shares from the post object, clicks from insights.
 * (post_impressions* metrics were retired by Meta in v21 — no view counts
 * exist at post level anymore.)
 * Instagram: reach/likes/comments/saved/shares via media insights; same set
 * works for images, carousels, and reels.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/corsHeaders.ts';

const FB_API_VERSION = 'v21.0';

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

async function graphGet(path: string, token: string): Promise<Record<string, unknown> | null> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(
    `https://graph.facebook.com/${FB_API_VERSION}/${path}${sep}access_token=${encodeURIComponent(token)}`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) {
    console.warn(`[social-engagement] graph ${res.status} for ${path.split('?')[0]}: ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  return res.json();
}

interface FbEngagement {
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
}

async function fetchFbEngagement(postId: string, token: string): Promise<FbEngagement | null> {
  const obj = await graphGet(
    `${postId}?fields=likes.summary(true).limit(0),comments.summary(true).limit(0),shares`,
    token,
  );
  if (!obj) return null;

  let clicks = 0;
  const ins = await graphGet(`${postId}/insights?metric=post_clicks`, token);
  const insData = (ins?.data as Array<{ values?: Array<{ value?: number }> }>) || [];
  if (insData[0]?.values?.[0]?.value != null) clicks = insData[0].values[0].value!;

  const likes = (obj.likes as { summary?: { total_count?: number } })?.summary?.total_count ?? 0;
  const comments = (obj.comments as { summary?: { total_count?: number } })?.summary?.total_count ?? 0;
  const shares = (obj.shares as { count?: number })?.count ?? 0;
  return { likes, comments, shares, clicks };
}

interface IgEngagement {
  reach: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
}

async function fetchIgEngagement(mediaId: string, token: string): Promise<IgEngagement | null> {
  const ins = await graphGet(
    `${mediaId}/insights?metric=reach,likes,comments,saved,shares`,
    token,
  );
  if (!ins) return null;
  const byName: Record<string, number> = {};
  for (const d of (ins.data as Array<{ name: string; values?: Array<{ value?: number }> }>) || []) {
    byName[d.name] = d.values?.[0]?.value ?? 0;
  }
  return {
    reach: byName.reach ?? 0,
    likes: byName.likes ?? 0,
    comments: byName.comments ?? 0,
    saves: byName.saved ?? 0,
    shares: byName.shares ?? 0,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { data: config } = await supabase
      .from('mkt_social_config')
      .select('org_id, fb_page_id, ig_user_id, fb_page_access_token')
      .eq('active', true)
      .maybeSingle();

    const token = config?.fb_page_access_token as string | undefined;
    if (!token) return ok({ skip: 'no fb_page_access_token on mkt_social_config' });

    // Daily follower snapshot per channel (powers the Performance dashboard's
    // growth trend). Upsert = re-runs on the same day just refresh the row.
    const statDate = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10); // IST day
    if (config.fb_page_id) {
      const page = await graphGet(`${config.fb_page_id}?fields=followers_count,fan_count`, token);
      if (page) {
        await supabase.from('mkt_channel_stats_daily').upsert({
          org_id: config.org_id,
          stat_date: statDate,
          channel: 'facebook',
          followers: (page.followers_count as number) ?? (page.fan_count as number) ?? null,
          extra: { fan_count: page.fan_count ?? null },
        }, { onConflict: 'org_id,stat_date,channel' });
      }
    }
    if (config.ig_user_id) {
      const ig = await graphGet(`${config.ig_user_id}?fields=followers_count,media_count`, token);
      if (ig) {
        await supabase.from('mkt_channel_stats_daily').upsert({
          org_id: config.org_id,
          stat_date: statDate,
          channel: 'instagram',
          followers: (ig.followers_count as number) ?? null,
          extra: { media_count: ig.media_count ?? null },
        }, { onConflict: 'org_id,stat_date,channel' });
      }
    }

    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: posts, error: postsErr } = await supabase
      .from('blog_posts')
      .select('id, fb_post_id, ig_post_id, ig_reel_id')
      .or('fb_post_id.not.is.null,ig_post_id.not.is.null,ig_reel_id.not.is.null')
      .gte('posted_timestamp', fourteenDaysAgo)
      .limit(120);

    if (postsErr) return err(500, postsErr.message);
    if (!posts?.length) return ok({ skip: 'no recently posted rows with FB/IG ids' });

    let fbUpdated = 0;
    let igUpdated = 0;
    const now = new Date().toISOString();

    for (const post of posts) {
      const update: Record<string, unknown> = {};

      if (post.fb_post_id) {
        const eng = await fetchFbEngagement(post.fb_post_id as string, token);
        if (eng) {
          update.fb_likes = eng.likes;
          update.fb_comments = eng.comments;
          update.fb_shares = eng.shares;
          update.fb_clicks = eng.clicks;
          update.fb_engagement_fetched_at = now;
          fbUpdated++;
        }
      }

      // A row can carry both an IG image/carousel post and a Reel (text-format
      // rows post both). Sum the two so the columns describe the row's total
      // Instagram footprint.
      const igIds = [post.ig_post_id, post.ig_reel_id].filter(Boolean) as string[];
      if (igIds.length) {
        const parts = (await Promise.all(igIds.map((id) => fetchIgEngagement(id, token))))
          .filter((e): e is IgEngagement => e !== null);
        if (parts.length) {
          update.ig_reach = parts.reduce((s, e) => s + e.reach, 0);
          update.ig_likes = parts.reduce((s, e) => s + e.likes, 0);
          update.ig_comments = parts.reduce((s, e) => s + e.comments, 0);
          update.ig_saves = parts.reduce((s, e) => s + e.saves, 0);
          update.ig_shares = parts.reduce((s, e) => s + e.shares, 0);
          update.ig_engagement_fetched_at = now;
          igUpdated++;
        }
      }

      if (Object.keys(update).length) {
        await supabase.from('blog_posts').update(update).eq('id', post.id);
      }
    }

    console.log(`[social-engagement] swept ${posts.length} rows: fb=${fbUpdated} ig=${igUpdated}`);
    return ok({ success: true, swept: posts.length, fb_updated: fbUpdated, ig_updated: igUpdated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[social-engagement] fatal:', msg);
    return err(500, msg);
  }
});
