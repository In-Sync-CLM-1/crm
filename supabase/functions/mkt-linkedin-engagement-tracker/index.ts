import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callLLM } from '../_shared/llmClient.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';

const LINKEDIN_VERSION = '202503';

// ── Engagement fetch ───────────────────────────────────────────────────────────

interface Engagement {
  impressions: number;
  likes: number;
  comments: number;
  reposts: number;
  clicks: number;
}

async function fetchEngagement(postUrn: string, token: string): Promise<Engagement> {
  // organizationalEntityShareStatistics requires organization-page access, which
  // this LinkedIn app doesn't have (posting happens as a member, not a company
  // page). socialActions gives like/comment counts for any post regardless of
  // author type, so that's the only source available here — impressions and
  // reposts aren't exposed to member-level access.
  return fetchEngagementFallback(postUrn, token);
}

async function fetchEngagementFallback(postUrn: string, token: string): Promise<Engagement> {
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

  if (!res.ok) return { impressions: 0, likes: 0, comments: 0, reposts: 0, clicks: 0 };

  const data = await res.json();
  return {
    impressions: 0,
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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // 1. Load config
    const { data: config } = await supabase
      .from('mkt_linkedin_config')
      .select('*')
      .eq('active', true)
      .maybeSingle();

    if (!config) return ok({ skip: 'no active config' });
    if (!config.member_access_token || !config.member_urn) {
      return ok({ skip: 'linkedin not connected — no member_access_token/member_urn on config' });
    }

    const token = config.member_access_token as string;
    const memberUrn = config.member_urn as string;

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

    // 4. Find posts that need engagement metrics fetched (wait 24h after posting)
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: pendingPosts } = await supabase
      .from('blog_posts')
      .select('id, linkedin_post_urn, linkedin_slot_index, linkedin_cycle')
      .eq('org_id', config.org_id)
      .not('linkedin_post_urn', 'is', null)
      .is('linkedin_engagement_fetched_at', null)
      .lte('posted_timestamp', twoDaysAgo)
      .order('posted_timestamp', { ascending: false })
      .limit(20);

    if (!pendingPosts?.length) {
      console.log('[engagement-tracker] no pending engagement to fetch');
    } else {
      // 5. Fetch engagement for each post
      for (const post of pendingPosts) {
        if (!post.linkedin_post_urn) continue;

        const eng = await fetchEngagement(post.linkedin_post_urn, token);
        const score = eng.likes * 1 + eng.comments * 3 + eng.reposts * 5;

        await supabase
          .from('blog_posts')
          .update({
            linkedin_impressions: eng.impressions,
            linkedin_likes: eng.likes,
            linkedin_comments: eng.comments,
            linkedin_reposts: eng.reposts,
            linkedin_engagement_score: score,
            linkedin_engagement_fetched_at: new Date().toISOString(),
          })
          .eq('id', post.id);

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
