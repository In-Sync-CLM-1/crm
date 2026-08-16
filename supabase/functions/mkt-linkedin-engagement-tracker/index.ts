import { callLLM } from '../_shared/llmClient.ts';
import { getLinkedInIdentity } from '../_shared/linkedinAuth.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const LINKEDIN_VERSION = '202503';

// ── Engagement fetch ───────────────────────────────────────────────────────────

interface Engagement {
  // null = this source cannot report reach at all. It must never be written as
  // 0: a real zero and "we couldn't measure it" look identical on a chart, and
  // writing the fake zero destroys a figure LinkedIn already gave us.
  impressions: number | null;
  likes: number;
  comments: number;
  reposts: number;
  clicks: number;
}

/**
 * LinkedIn enforces a per-day call ceiling per API resource. Once it is hit
 * every further call returns 429 until the counter rolls over. That is a
 * temporary outage, not an answer — so it aborts the sweep instead of letting
 * the caller fall through to a weaker source and record its blanks as data.
 */
class LinkedInThrottled extends Error {
  constructor(resource: string) {
    super(`LinkedIn daily throttle reached on ${resource}`);
  }
}

/**
 * Full per-post statistics for company-page posts via the Community
 * Management API (impressions, clicks, likes, comments, reposts). Only works
 * for posts authored BY the organization — member-era posts return no
 * elements and the caller falls back to socialActions.
 */
async function fetchOrgShareStats(postUrn: string, orgUrn: string, token: string): Promise<Engagement | null> {
  const listParam = postUrn.includes(':ugcPost:') ? 'ugcPosts' : 'shares';
  const res = await fetch(
    `https://api.linkedin.com/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(orgUrn)}&${listParam}=List(${encodeURIComponent(postUrn)})`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'LinkedIn-Version': LINKEDIN_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (res.status === 429) throw new LinkedInThrottled('organizationalEntityShareStatistics');

  if (!res.ok) {
    console.warn(`[engagement-tracker] shareStatistics ${res.status} for ${postUrn}: ${await res.text()}`);
    return null;
  }

  const data = await res.json();
  const s = data?.elements?.[0]?.totalShareStatistics;
  if (!s) return null;
  return {
    impressions: s.impressionCount ?? 0,
    likes: s.likeCount ?? 0,
    comments: s.commentCount ?? 0,
    reposts: s.shareCount ?? 0,
    clicks: s.clickCount ?? 0,
  };
}

/**
 * Per-post statistics for posts authored by the authenticated MEMBER (the
 * founder persona stream + member-era posts) via memberCreatorPostAnalytics
 * (r_member_postAnalytics). One request per metric; requires version >= 202508
 * (the endpoint does not exist on this function's older baseline version).
 * Returns null when the post isn't member-authored or access is denied.
 */
const MEMBER_ANALYTICS_VERSION = '202508';

async function fetchMemberPostStats(postUrn: string, token: string): Promise<Engagement | null> {
  const urnKey = postUrn.includes(':ugcPost:') ? 'ugc' : 'share';
  const entity = `(${urnKey}:${encodeURIComponent(postUrn)})`;

  const counts: Record<string, number> = {};
  for (const metric of ['IMPRESSION', 'REACTION', 'COMMENT', 'RESHARE']) {
    const res = await fetch(
      `https://api.linkedin.com/rest/memberCreatorPostAnalytics?q=entity&entity=${entity}&queryType=${metric}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'LinkedIn-Version': MEMBER_ANALYTICS_VERSION,
          'X-Restli-Protocol-Version': '2.0.0',
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (res.status === 429) throw new LinkedInThrottled('memberCreatorPostAnalytics');
    if (!res.ok) {
      console.warn(`[engagement-tracker] memberCreatorPostAnalytics ${res.status} (${metric}) for ${postUrn}`);
      return null;
    }
    const data = await res.json();
    const el = data?.elements?.[0];
    if (!el || typeof el.count !== 'number') return null;
    counts[metric] = el.count;
  }

  return {
    impressions: counts.IMPRESSION ?? 0,
    likes: counts.REACTION ?? 0,
    comments: counts.COMMENT ?? 0,
    reposts: counts.RESHARE ?? 0,
    clicks: 0,
  };
}

async function fetchEngagement(postUrn: string, token: string): Promise<Engagement | null> {
  // socialActions like/comment counts: 403 "partnerApiSocialActions" on the
  // legacy member-token app (verified 2026-07-15), but allowed for a
  // Community Management token on the org's own posts. Returns null when
  // unavailable so the caller records "unknown", never a fake zero.
  //
  // This endpoint carries no reach at all, so impressions come back null — it
  // is a likes/comments source only, and must not be read as "reach was 0".
  const encodedUrn = encodeURIComponent(postUrn);
  const res = await fetch(
    `https://api.linkedin.com/rest/socialActions/${encodedUrn}?fields=likesSummary,commentsSummary`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'LinkedIn-Version': LINKEDIN_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (res.status === 429) throw new LinkedInThrottled('socialActions');

  if (!res.ok) {
    console.warn(`[engagement-tracker] socialActions ${res.status} for ${postUrn} — engagement not available at this access level`);
    return null;
  }

  const data = await res.json();
  return {
    impressions: null,
    likes: data?.likesSummary?.totalLikes ?? 0,
    comments: data?.commentsSummary?.totalFirstLevelComments ?? 0,
    reposts: 0,
    clicks: 0,
  };
}

// ── Comment replies ───────────────────────────────────────────────────────────

interface LinkedInComment {
  id: string;           // comment URN
  authorUrn: string;
  text: string;
  createdAt: number;    // epoch ms
}

async function fetchComments(postUrn: string, token: string): Promise<LinkedInComment[]> {
  const encoded = encodeURIComponent(postUrn);
  const res = await fetch(
    `https://api.linkedin.com/rest/socialActions/${encoded}/comments?count=20&start=0`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'LinkedIn-Version': LINKEDIN_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!res.ok) {
    console.warn(`[engagement-tracker] comments API ${res.status} for ${postUrn}`);
    return [];
  }

  const data = await res.json();
  return (data?.elements ?? []).map((el: Record<string, unknown>) => ({
    id: el.id as string,
    authorUrn: (el.actor as string) ?? '',
    text: ((el.message as Record<string, unknown>)?.text as string) ?? '',
    createdAt: (el.created as Record<string, unknown>)?.time as number ?? 0,
  }));
}

async function postReply(
  postUrn: string,
  replyText: string,
  token: string,
  actorUrn: string,
): Promise<boolean> {
  const encoded = encodeURIComponent(postUrn);
  const res = await fetch(
    `https://api.linkedin.com/rest/socialActions/${encoded}/comments`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'LinkedIn-Version': LINKEDIN_VERSION,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        actor: actorUrn,
        message: { text: replyText },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    console.warn(`[engagement-tracker] reply failed ${res.status}: ${errText}`);
    return false;
  }
  return true;
}

async function generateReply(
  commentText: string,
  postTitle: string,
  productName: string,
  productUrl: string,
): Promise<string> {
  const prompt = `You are the In-Sync company LinkedIn account. Someone commented on your post about ${productName}.

POST TITLE: ${postTitle}
COMMENT: "${commentText}"

Write a genuine, thoughtful reply (2-4 sentences). Rules:
- Acknowledge their specific point — no generic "Thanks for commenting!"
- Add one piece of value: a related insight, stat, or nuance they may not have considered
- If their comment shows a genuine problem, you can briefly mention ${productName} as something worth checking — but only if it fits naturally (don't force it)
- End with a question to keep the conversation going
- Max 300 characters
- Conversational tone, not corporate

Reply text only, no quotes, no label.`;

  const res = await callLLM(prompt, {
    model: 'haiku',
    max_tokens: 150,
    temperature: 0.7,
  });

  return res.content.trim();
}

async function handleCommentReplies(
  posts: Array<{ id: string; linkedin_post_urn: string; blog_title: string; product_key: string | null }>,
  orgId: string,
  token: string,
  memberUrn: string,
  supabase: ReturnType<typeof createClient>,
): Promise<number> {
  let repliesPosted = 0;

  for (const post of posts) {
    if (!post.linkedin_post_urn) continue;

    const comments = await fetchComments(post.linkedin_post_urn, token);
    if (!comments.length) continue;

    // Find substantive comments NOT from us (> 10 words)
    const theirComments = comments.filter(
      (c) => c.authorUrn !== memberUrn && c.text.split(' ').length > 10,
    );

    // Track our existing reply timestamps to detect already-replied comments
    const ourReplyTimestamps = comments
      .filter((c) => c.authorUrn === memberUrn)
      .map((c) => c.createdAt);

    // Load LATEST ICP for this post's product (evolving ICP = always current)
    let productName = 'our product';
    let productUrl = '';
    if (post.product_key) {
      const { data: prod } = await supabase
        .from('mkt_products')
        .select('product_name, product_url')
        .eq('product_key', post.product_key)
        .eq('org_id', orgId)
        .maybeSingle();

      const { data: icp } = await supabase
        .from('mkt_product_icp')
        .select('industries, designations, pain_points')
        .eq('product_key', post.product_key)
        .eq('org_id', orgId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (prod) {
        productName = prod.product_name;
        productUrl = prod.product_url ?? '';
      }

      // Enrich reply context with current ICP pain points
      if (icp?.pain_points && Array.isArray(icp.pain_points)) {
        productName = `${productName} (addresses: ${(icp.pain_points as string[]).slice(0, 2).join(', ')})`;
      }
    }

    for (const comment of theirComments) {
      const alreadyReplied = ourReplyTimestamps.some((t) => t > comment.createdAt);
      if (alreadyReplied) continue;

      const reply = await generateReply(
        comment.text,
        post.blog_title,
        productName,
        productUrl,
      );

      const ok = await postReply(post.linkedin_post_urn, reply, token, memberUrn);
      if (ok) {
        repliesPosted++;
        console.log(`[engagement-tracker] replied to comment on post ${post.id}`);
      }

      await new Promise((r) => setTimeout(r, 2000)); // rate limit buffer
    }
  }

  return repliesPosted;
}

// ── Winner selection ──────────────────────────────────────────────────────────

interface SlotPerformance {
  slot_index: number;
  slot_time: string;
  avg_engagement_score: number;
  posts_sampled: number;
}

function analyzeExperiment(
  posts: Array<{
    linkedin_slot_index: number;
    linkedin_likes: number;
    linkedin_comments: number;
    linkedin_reposts: number;
  }>,
  slots: string[],
): SlotPerformance[] {
  const bySlot: Record<number, number[]> = {};

  for (const post of posts) {
    const idx = post.linkedin_slot_index;
    if (idx == null) continue;
    // Weighted score: likes×1 + comments×3 + reposts×5
    const score = (post.linkedin_likes ?? 0) * 1
      + (post.linkedin_comments ?? 0) * 3
      + (post.linkedin_reposts ?? 0) * 5;
    if (!bySlot[idx]) bySlot[idx] = [];
    bySlot[idx].push(score);
  }

  return slots.map((slot, idx) => {
    const scores = bySlot[idx] ?? [];
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    return {
      slot_index: idx,
      slot_time: slot,
      avg_engagement_score: Math.round(avg * 100) / 100,
      posts_sampled: scores.length,
    };
  }).sort((a, b) => b.avg_engagement_score - a.avg_engagement_score);
}

// ── Response helpers ──────────────────────────────────────────────────────────

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = getSupabaseClient();

  try {
    // 1. Load config
    const { data: config } = await supabase
      .from('mkt_linkedin_config')
      .select('*')
      .eq('active', true)
      .maybeSingle();

    if (!config) return ok({ skip: 'no active config' });

    // Company-page identity when connected (full stats + working comment
    // APIs); member fallback otherwise (mostly partner-gated, records NULLs).
    const identity = await getLinkedInIdentity(supabase, config);
    if (!identity) {
      return ok({ skip: 'linkedin not connected — no usable org or member token on config' });
    }

    const token = identity.token;
    const memberUrn = identity.authorUrn;
    const orgUrn = identity.isOrg ? identity.authorUrn : null;

    // Daily follower snapshot (powers the Performance dashboard growth trend)
    if (orgUrn) {
      const sizeRes = await fetch(
        `https://api.linkedin.com/rest/networkSizes/${encodeURIComponent(orgUrn)}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'LinkedIn-Version': LINKEDIN_VERSION,
            'X-Restli-Protocol-Version': '2.0.0',
          },
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (sizeRes.ok) {
        const size = await sizeRes.json();
        const statDate = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10); // IST day
        await supabase.from('mkt_channel_stats_daily').upsert({
          org_id: config.org_id,
          stat_date: statDate,
          channel: 'linkedin',
          followers: (size.firstDegreeSize as number) ?? null,
          extra: {},
        }, { onConflict: 'org_id,stat_date,channel' });
      } else {
        console.warn(`[engagement-tracker] networkSizes ${sizeRes.status}: ${await sizeRes.text()}`);
      }
    }

    // 2. Find posts with LinkedIn URNs (last 7 days) for comment replies
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentPosts } = await supabase
      .from('blog_posts')
      .select('id, linkedin_post_urn, blog_title, product_key')
      .eq('org_id', config.org_id)
      .not('linkedin_post_urn', 'is', null)
      .gte('posted_timestamp', sevenDaysAgo)
      .order('posted_timestamp', { ascending: false })
      .limit(10);

    // 3. Reply to substantive comments using latest ICP
    let repliesPosted = 0;
    if (recentPosts?.length) {
      repliesPosted = await handleCommentReplies(recentPosts, config.org_id, token, memberUrn, supabase);
    }

    // 4. Re-read engagement for every post of the last 14 days.
    // LinkedIn's numbers are cumulative and keep moving long after publication
    // — a post that is boosted, or simply picked up later, gains most of its
    // reach after the first 48 hours. Fetching once and never again froze
    // every row at a 48-hour snapshot and made the reporting understate real
    // performance. Same window the Meta tracker uses; the newest value
    // overwrites the previous one.
    //
    // At most one re-read per post per day. This function runs hourly (for
    // comment replies), and re-reading all 20 posts on every run spent ~480
    // statistics calls a day against LinkedIn's per-resource daily ceiling —
    // it ran out mid-morning and every later run got 429s. Once a day is all
    // the daily charts need, and it keeps the sweep inside the ceiling.
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const staleAfter = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
    const { data: pendingPosts } = await supabase
      .from('blog_posts')
      .select('id, linkedin_post_urn, linkedin_slot_index, linkedin_cycle')
      .eq('org_id', config.org_id)
      .not('linkedin_post_urn', 'is', null)
      .gte('posted_timestamp', fourteenDaysAgo)
      .or(`linkedin_engagement_fetched_at.is.null,linkedin_engagement_fetched_at.lt.${staleAfter}`)
      .order('posted_timestamp', { ascending: false })
      .limit(20);

    if (!pendingPosts?.length) {
      console.log('[engagement-tracker] no pending engagement to fetch');
    } else {
      // 5. Fetch engagement for each post
      for (const post of pendingPosts) {
        if (!post.linkedin_post_urn) continue;

        // Org-authored posts → org share statistics. Member-authored posts
        // (persona stream + member-era rows) → memberCreatorPostAnalytics.
        // socialActions is the last resort; a post none of them cover stays
        // NULL ("unknown"), never a fake zero.
        let eng: Engagement | null;
        try {
          eng = (orgUrn ? await fetchOrgShareStats(post.linkedin_post_urn, orgUrn, token) : null)
            ?? (await fetchMemberPostStats(post.linkedin_post_urn, token))
            ?? (await fetchEngagement(post.linkedin_post_urn, token));
        } catch (e) {
          if (e instanceof LinkedInThrottled) {
            // Out of quota for today. Leave every remaining post untouched —
            // it keeps yesterday's real figures and is picked up tomorrow.
            console.warn(`[engagement-tracker] ${e.message} — stopping this sweep, ${pendingPosts.length - pendingPosts.indexOf(post)} post(s) left for the next run`);
            break;
          }
          throw e;
        }
        if (!eng) {
          // Metrics unavailable (LinkedIn partner-gated) — record the attempt
          // but leave every metric NULL: "unknown" must stay distinguishable
          // from a real zero. Retries stop when the post leaves the window.
          await supabase
            .from('blog_posts')
            .update({ linkedin_engagement_fetched_at: new Date().toISOString() })
            .eq('id', post.id);
          continue;
        }
        const score = eng.likes * 1 + eng.comments * 3 + eng.reposts * 5;

        // Reach is written only when the source actually measured it. When it
        // didn't, the column keeps whatever a stronger source recorded before
        // rather than being flattened to 0.
        await supabase
          .from('blog_posts')
          .update({
            ...(eng.impressions !== null ? { linkedin_impressions: eng.impressions } : {}),
            linkedin_likes: eng.likes,
            linkedin_comments: eng.comments,
            linkedin_reposts: eng.reposts,
            linkedin_engagement_score: score,
            linkedin_engagement_fetched_at: new Date().toISOString(),
          })
          .eq('id', post.id);

        // Snapshot today's cumulative value so the per-day charts can show a
        // real daily figure (tomorrow's value minus today's) instead of
        // dumping a post's whole lifetime total onto its publish date.
        await supabase
          .from('mkt_post_metrics_daily')
          .upsert({
            org_id: config.org_id,
            post_id: post.id,
            stat_date: new Date().toISOString().slice(0, 10),
            channel: 'linkedin',
            ...(eng.impressions !== null ? { reach: eng.impressions } : {}),
            interactions: eng.likes + eng.comments + eng.reposts,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'post_id,channel,stat_date' });

        console.log(`[engagement-tracker] post ${post.id}: likes=${eng.likes} comments=${eng.comments} reposts=${eng.reposts}`);
      }
    }

    // 4. Check if experiment is complete and winner not yet selected
    if (!config.experiment_complete || config.winning_slot) {
      // Check if 27 days have passed and we have enough data
      const { data: allPosts } = await supabase
        .from('blog_posts')
        .select('linkedin_slot_index, linkedin_cycle, linkedin_likes, linkedin_comments, linkedin_reposts')
        .eq('org_id', config.org_id)
        .not('linkedin_slot_index', 'is', null)
        .not('linkedin_engagement_fetched_at', 'is', null);

      if (allPosts && allPosts.length >= 27 && !config.winning_slot) {
        // All 27 days data available — pick winner
        const slots = config.experiment_slots as string[];
        const rankings = analyzeExperiment(allPosts, slots);
        const winner = rankings[0];

        console.log(`[engagement-tracker] experiment complete. Winner: slot ${winner.slot_index} (${winner.slot_time} IST) avg_score=${winner.avg_engagement_score}`);

        await supabase
          .from('mkt_linkedin_config')
          .update({
            experiment_complete: true,
            winning_slot: winner.slot_time,
          })
          .eq('id', config.id);

        return ok({
          experiment_complete: true,
          winner: winner,
          all_rankings: rankings,
          message: `Winning slot: ${winner.slot_time} IST (avg engagement score: ${winner.avg_engagement_score})`,
        });
      }
    }

    return ok({
      success: true,
      engagement_fetched: pendingPosts?.length ?? 0,
      replies_posted: repliesPosted,
      experiment_complete: config.experiment_complete,
      winning_slot: config.winning_slot,
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[engagement-tracker] fatal:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
