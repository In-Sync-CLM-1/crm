/**
 * mkt-member-engagement — the founder↔company mechanic.
 *
 * Twice a week (cron worker `member-engagement`, Mon+Thu 13:00 IST) Amit's
 * member profile engages with ONE recent company-page post: alternating
 * between a reshare (with a short first-person line) and a comment. This
 * pulls the personal audience toward the company page without same-day
 * mirroring (the persona stream stays separate — see mkt-blog-writer).
 *
 * Picks the best-performing un-engaged company post from 1–4 days ago, so
 * the founder always amplifies content that has already proven itself.
 * Body {"dry_run":true} selects + drafts but does not touch LinkedIn.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callLLM } from '../_shared/llmClient.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { getLinkedInIdentity } from '../_shared/linkedinAuth.ts';

const LINKEDIN_VERSION = '202503';

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function draftLine(kind: 'reshare' | 'comment', postTitle: string, postText: string): Promise<string> {
  const prompt = `You are Amit, founder of In-Sync (a business platform for Indian SMBs), ${
    kind === 'reshare'
      ? 'resharing a post from your company page to your personal LinkedIn profile. Write the one short line that goes above the reshare.'
      : "commenting on your own company page's LinkedIn post from your personal profile. Write the comment."
  }

COMPANY POST TITLE: ${postTitle}
COMPANY POST (excerpt): ${postText.slice(0, 600)}

Rules:
- First person, founder voice: plain, warm, specific — never corporate, never salesy
- Add one personal angle: why this topic matters to you, or what you saw firsthand
- No hashtags, no emojis, no "check it out", no exclamation marks
- 1-2 sentences, max 220 characters
- Reply with the line only, no quotes, no label`;

  const res = await callLLM(prompt, { model: 'haiku', max_tokens: 120, temperature: 0.7 });
  return res.content.trim().replace(/^["']|["']$/g, '');
}

async function reshareAsMember(parentUrn: string, line: string, memberUrn: string, token: string): Promise<string> {
  const res = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'LinkedIn-Version': LINKEDIN_VERSION,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: memberUrn,
      commentary: line,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
      reshareContext: { parent: parentUrn },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`reshare failed ${res.status}: ${await res.text()}`);
  return res.headers.get('x-restli-id') ?? '';
}

async function commentAsMember(postUrn: string, line: string, memberUrn: string, token: string): Promise<void> {
  const res = await fetch(
    `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(postUrn)}/comments`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'LinkedIn-Version': LINKEDIN_VERSION,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({ actor: memberUrn, message: { text: line } }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!res.ok) throw new Error(`comment failed ${res.status}: ${await res.text()}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;

    const { data: config } = await supabase
      .from('mkt_linkedin_config')
      .select('*')
      .eq('active', true)
      .maybeSingle();
    if (!config?.member_urn) return ok({ skip: 'no member connection on mkt_linkedin_config' });

    // getLinkedInIdentity keeps the single-app token fresh; the member action
    // itself runs with member_urn as the actor.
    const identity = await getLinkedInIdentity(supabase, config);
    if (!identity) return ok({ skip: 'linkedin not connected' });
    const token = config.member_access_token === config.org_access_token
      ? identity.token
      : (config.member_access_token as string);

    // Never engage twice within 48h even if invoked off-schedule.
    const { data: recent } = await supabase
      .from('blog_posts')
      .select('id, member_engagement_type')
      .not('member_engaged_at', 'is', null)
      .gte('member_engaged_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
      .limit(1);
    if (recent?.length && !dryRun) return ok({ skip: 'already engaged within 48h' });

    // Candidate: best un-engaged company post, 1–4 days old (old enough not to
    // be a same-day mirror, fresh enough that a reshare still makes sense).
    const now = Date.now();
    const { data: candidates } = await supabase
      .from('blog_posts')
      .select('id, blog_title, linkedin_draft_text, linkedin_post_urn, linkedin_engagement_score, member_engagement_type')
      .eq('org_id', config.org_id)
      .eq('status', 'posted')
      .eq('channel', 'company')
      .not('linkedin_post_urn', 'is', null)
      .is('member_engaged_at', null)
      .gte('posted_timestamp', new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString())
      .lte('posted_timestamp', new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString())
      .order('linkedin_engagement_score', { ascending: false, nullsFirst: false })
      .limit(1);

    const post = candidates?.[0];
    if (!post) return ok({ skip: 'no un-engaged company post in the 1-4 day window' });

    // Alternate with whatever the member did last time.
    const { data: last } = await supabase
      .from('blog_posts')
      .select('member_engagement_type')
      .not('member_engaged_at', 'is', null)
      .order('member_engaged_at', { ascending: false })
      .limit(1);
    const kind: 'reshare' | 'comment' = last?.[0]?.member_engagement_type === 'reshare' ? 'comment' : 'reshare';

    const line = await draftLine(kind, post.blog_title as string, (post.linkedin_draft_text as string) ?? '');

    if (dryRun) {
      return ok({ dry_run: true, would: kind, post_id: post.id, post_title: post.blog_title, line });
    }

    if (kind === 'reshare') {
      await reshareAsMember(post.linkedin_post_urn as string, line, config.member_urn as string, token);
    } else {
      await commentAsMember(post.linkedin_post_urn as string, line, config.member_urn as string, token);
    }

    await supabase
      .from('blog_posts')
      .update({ member_engaged_at: new Date().toISOString(), member_engagement_type: kind })
      .eq('id', post.id);

    console.log(`[member-engagement] ${kind} on post ${post.id}`);
    return ok({ success: true, action: kind, post_id: post.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[member-engagement] fatal:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
