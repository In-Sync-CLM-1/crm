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
import { getXCreds, getOwnProfile, getTweetMetrics } from '../_shared/xClient.ts';

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

// ── YouTube ───────────────────────────────────────────────────────────────────
// Video statistics are public data (videos.list costs 1 quota unit), and
// channels.list?mine=true works with the upload-scoped token — both verified
// live 2026-07-18. Skips silently when YouTube credentials are not configured.

async function getYoutubeAccessToken(): Promise<string | null> {
  const clientId = Deno.env.get('YOUTUBE_CLIENT_ID') || Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('YOUTUBE_CLIENT_SECRET') || Deno.env.get('GOOGLE_CLIENT_SECRET');
  const refreshToken = Deno.env.get('YOUTUBE_REFRESH_TOKEN') || Deno.env.get('GOOGLE_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) return null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    console.warn(`[social-engagement] YT token refresh ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  return (await res.json()).access_token ?? null;
}

interface YtStats {
  views: number;
  likes: number;
  comments: number;
}

async function fetchYtStatsBatch(videoIds: string[], accessToken: string): Promise<Record<string, YtStats>> {
  const out: Record<string, YtStats> = {};
  // videos.list accepts up to 50 ids per call
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${batch.join(',')}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) {
      console.warn(`[social-engagement] YT videos.list ${res.status}: ${(await res.text()).slice(0, 200)}`);
      continue;
    }
    const data = await res.json();
    for (const item of data.items ?? []) {
      const s = item.statistics ?? {};
      out[item.id] = {
        views: Number(s.viewCount ?? 0),
        likes: Number(s.likeCount ?? 0),
        comments: Number(s.commentCount ?? 0),
      };
    }
  }
  return out;
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

    if (!config) return ok({ skip: 'no active mkt_social_config' });
    const token = config.fb_page_access_token as string | undefined;

    // Daily follower snapshot per channel (powers the Performance dashboard's
    // growth trend). Upsert = re-runs on the same day just refresh the row.
    const statDate = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10); // IST day
    if (token && config.fb_page_id) {
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
    if (token && config.ig_user_id) {
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

    // YouTube: channel snapshot + per-video stats prefetch
    const ytAccessToken = await getYoutubeAccessToken();
    if (ytAccessToken) {
      const chRes = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true',
        { headers: { 'Authorization': `Bearer ${ytAccessToken}` }, signal: AbortSignal.timeout(15_000) },
      );
      if (chRes.ok) {
        const ch = (await chRes.json())?.items?.[0]?.statistics;
        if (ch) {
          await supabase.from('mkt_channel_stats_daily').upsert({
            org_id: config.org_id,
            stat_date: statDate,
            channel: 'youtube',
            followers: Number(ch.subscriberCount ?? 0),
            extra: { view_count: Number(ch.viewCount ?? 0), video_count: Number(ch.videoCount ?? 0) },
          }, { onConflict: 'org_id,stat_date,channel' });
        }
      } else {
        console.warn(`[social-engagement] YT channels.list ${chRes.status}: ${(await chRes.text()).slice(0, 200)}`);
      }
    }

    // X: channel snapshot (followers) + per-post metrics prefetch
    const xCreds = getXCreds();
    if (xCreds) {
      const profile = await getOwnProfile(xCreds);
      if (profile) {
        await supabase.from('mkt_channel_stats_daily').upsert({
          org_id: config.org_id,
          stat_date: statDate,
          channel: 'x',
          followers: profile.followers,
          extra: { screen_name: profile.screenName },
        }, { onConflict: 'org_id,stat_date,channel' });
      }
    }

    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: posts, error: postsErr } = await supabase
      .from('blog_posts')
      .select('id, fb_post_id, ig_post_id, ig_reel_id, yt_video_id, x_post_id')
      .or('fb_post_id.not.is.null,ig_post_id.not.is.null,ig_reel_id.not.is.null,yt_video_id.not.is.null,x_post_id.not.is.null')
      .gte('posted_timestamp', fourteenDaysAgo)
      .limit(120);

    if (postsErr) return err(500, postsErr.message);
    if (!posts?.length) return ok({ skip: 'no recently posted rows with FB/IG/YT/X ids' });

    const ytIds = posts.map((p) => p.yt_video_id as string | null).filter(Boolean) as string[];
    const ytStats = ytAccessToken && ytIds.length ? await fetchYtStatsBatch(ytIds, ytAccessToken) : {};

    const xIds = posts.map((p) => p.x_post_id as string | null).filter(Boolean) as string[];
    const xStats = xCreds && xIds.length ? await getTweetMetrics(xIds, xCreds) : {};

    let fbUpdated = 0;
    let igUpdated = 0;
    let ytUpdated = 0;
    let xUpdated = 0;
    const now = new Date().toISOString();

    for (const post of posts) {
      const update: Record<string, unknown> = {};

      if (token && post.fb_post_id) {
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
      const igIds = token ? [post.ig_post_id, post.ig_reel_id].filter(Boolean) as string[] : [];
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

      if (post.yt_video_id && ytStats[post.yt_video_id as string]) {
        const s = ytStats[post.yt_video_id as string];
        update.yt_views = s.views;
        update.yt_likes = s.likes;
        update.yt_comments = s.comments;
        update.yt_engagement_fetched_at = now;
        ytUpdated++;
      }

      if (post.x_post_id && xStats[post.x_post_id as string]) {
        const s = xStats[post.x_post_id as string];
        update.x_impressions = s.impressions;
        update.x_likes = s.likes;
        update.x_replies = s.replies;
        update.x_reposts = s.reposts;
        update.x_engagement_fetched_at = now;
        xUpdated++;
      }

      if (Object.keys(update).length) {
        await supabase.from('blog_posts').update(update).eq('id', post.id);

        // Snapshot today's cumulative values per channel, so the per-day charts
        // can plot a real daily figure (tomorrow minus today) instead of
        // attributing a post's whole lifetime total to its publish date.
        // reach stays NULL where the channel has none — Facebook lost
        // post-level impressions when Meta retired them in v21.
        const statDay = now.slice(0, 10);
        const snapshots: Record<string, unknown>[] = [];
        const snap = (channel: string, reach: number | null, interactions: number) =>
          snapshots.push({ org_id: config.org_id, post_id: post.id, stat_date: statDay, channel, reach, interactions, updated_at: now });

        if (update.fb_engagement_fetched_at) {
          snap('facebook', null, Number(update.fb_likes || 0) + Number(update.fb_comments || 0) + Number(update.fb_shares || 0));
        }
        if (update.ig_engagement_fetched_at) {
          snap('instagram', Number(update.ig_reach || 0), Number(update.ig_likes || 0) + Number(update.ig_comments || 0) + Number(update.ig_saves || 0) + Number(update.ig_shares || 0));
        }
        if (update.yt_engagement_fetched_at) {
          snap('youtube', Number(update.yt_views || 0), Number(update.yt_likes || 0) + Number(update.yt_comments || 0));
        }
        if (update.x_engagement_fetched_at) {
          snap('x', Number(update.x_impressions || 0), Number(update.x_likes || 0) + Number(update.x_replies || 0) + Number(update.x_reposts || 0));
        }
        if (snapshots.length) {
          await supabase.from('mkt_post_metrics_daily').upsert(snapshots, { onConflict: 'post_id,channel,stat_date' });
        }
      }
    }

    console.log(`[social-engagement] swept ${posts.length} rows: fb=${fbUpdated} ig=${igUpdated} yt=${ytUpdated} x=${xUpdated}`);
    return ok({ success: true, swept: posts.length, fb_updated: fbUpdated, ig_updated: igUpdated, yt_updated: ytUpdated, x_updated: xUpdated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[social-engagement] fatal:', msg);
    return err(500, msg);
  }
});
