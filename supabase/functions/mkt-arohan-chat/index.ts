/**
 * mkt-arohan-chat — Arohan, In-Sync's marketing intelligence chat.
 *
 * v2 (2026-07-18): the outreach/lead-gen model was removed; Arohan evolved
 * into the analytics brain over the brand content pipeline. Context = the
 * last 30 days of posted content with real engagement (LinkedIn org stats,
 * FB/IG Graph metrics), follower snapshots, and the upcoming 7-day buffer —
 * so it can answer "what's working, what should we change" with numbers.
 *
 * Contract (unchanged from v1, frontend useArohanChat depends on it):
 *   POST { org_id, thread_id, message } →
 *   { reply, is_suggestion, actions_triggered }
 * Conversations persist in mkt_arohan_conversations per thread.
 */
import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { callLLM } from '../_shared/llmClient.ts';

interface ChatBody {
  org_id: string;
  thread_id: string;
  message: string;
}

const n = (v: unknown) => (typeof v === 'number' ? v : 0);

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const liInt = (p: Row) => n(p.linkedin_likes) + n(p.linkedin_comments) + n(p.linkedin_reposts);
const fbInt = (p: Row) => n(p.fb_likes) + n(p.fb_comments) + n(p.fb_shares);
const igInt = (p: Row) => n(p.ig_likes) + n(p.ig_comments) + n(p.ig_saves) + n(p.ig_shares);
const ytInt = (p: Row) => n(p.yt_likes) + n(p.yt_comments);

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

// deno-lint-ignore no-explicit-any
async function buildContext(supabase: any, orgId: string): Promise<string> {
  const [postedRes, upcomingRes, followersRes, configRes] = await Promise.all([
    supabase
      .from('blog_posts')
      .select('publish_date, post_format, content_theme, product_key, blog_title, linkedin_impressions, linkedin_likes, linkedin_comments, linkedin_reposts, fb_likes, fb_comments, fb_shares, fb_clicks, ig_reach, ig_likes, ig_comments, ig_saves, ig_shares, yt_views, yt_likes, yt_comments, linkedin_url')
      .eq('org_id', orgId)
      .eq('status', 'posted')
      .gte('publish_date', isoDaysAgo(30))
      .order('publish_date', { ascending: true }),
    supabase
      .from('blog_posts')
      .select('publish_date, day_seq, linkedin_slot_index, post_format, content_theme, product_key, blog_title, status')
      .eq('org_id', orgId)
      .gte('publish_date', new Date().toISOString().slice(0, 10))
      .in('status', ['pending', 'skipped'])
      .order('publish_date', { ascending: true })
      .limit(30),
    supabase
      .from('mkt_channel_stats_daily')
      .select('stat_date, channel, followers')
      .eq('org_id', orgId)
      .gte('stat_date', isoDaysAgo(30))
      .order('stat_date', { ascending: true }),
    supabase
      .from('mkt_linkedin_config')
      .select('experiment_slots, linkedin_org_id')
      .eq('org_id', orgId)
      .eq('active', true)
      .maybeSingle(),
  ]);

  const posted: Row[] = postedRes.data ?? [];
  const upcoming: Row[] = upcomingRes.data ?? [];
  const followers: Row[] = followersRes.data ?? [];
  const slots: string[] = (configRes.data?.experiment_slots as string[]) ?? [];

  const lines: string[] = [];

  lines.push('== POSTED CONTENT, LAST 30 DAYS (one line per post) ==');
  lines.push('date | format | theme | product | LI int/impr | FB int | IG int/reach | YT int/views | title');
  for (const p of posted) {
    lines.push(
      `${p.publish_date} | ${p.post_format ?? 'text'} | ${p.content_theme ?? '-'} | ${p.product_key ?? '-'} | ` +
      `${liInt(p)}/${p.linkedin_impressions ?? '?'} | ${fbInt(p)} | ${igInt(p)}/${p.ig_reach ?? '?'} | ` +
      `${ytInt(p)}/${p.yt_views ?? '?'} | ` +
      `${(p.blog_title ?? '').slice(0, 70)}`,
    );
  }
  if (!posted.length) lines.push('(none)');

  const sumRange = (from: string, to: string) => {
    const rows = posted.filter((p) => p.publish_date >= from && p.publish_date < to);
    return {
      posts: rows.length,
      li: rows.reduce((s, p) => s + liInt(p), 0),
      fb: rows.reduce((s, p) => s + fbInt(p), 0),
      ig: rows.reduce((s, p) => s + igInt(p), 0),
      yt: rows.reduce((s, p) => s + ytInt(p), 0),
      impressions: rows.reduce((s, p) => s + n(p.linkedin_impressions), 0),
      reach: rows.reduce((s, p) => s + n(p.ig_reach), 0),
      views: rows.reduce((s, p) => s + n(p.yt_views), 0),
    };
  };
  const today = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const wk = sumRange(isoDaysAgo(7), today);
  const prevWk = sumRange(isoDaysAgo(14), isoDaysAgo(7));
  lines.push('');
  lines.push('== WEEK VS PRIOR WEEK ==');
  lines.push(`Last 7d: ${wk.posts} posts, interactions LI ${wk.li} / FB ${wk.fb} / IG ${wk.ig} / YT ${wk.yt}, LI impressions ${wk.impressions}, IG reach ${wk.reach}, YT views ${wk.views}`);
  lines.push(`Prior 7d: ${prevWk.posts} posts, interactions LI ${prevWk.li} / FB ${prevWk.fb} / IG ${prevWk.ig} / YT ${prevWk.yt}, LI impressions ${prevWk.impressions}, IG reach ${prevWk.reach}, YT views ${prevWk.views}`);

  lines.push('');
  lines.push('== FOLLOWER SNAPSHOTS (daily, last 30d) ==');
  const byChannel = new Map<string, Row[]>();
  for (const f of followers) {
    if (!byChannel.has(f.channel)) byChannel.set(f.channel, []);
    byChannel.get(f.channel)!.push(f);
  }
  for (const [ch, rows] of byChannel) {
    const first = rows[0];
    const last = rows[rows.length - 1];
    lines.push(`${ch}: ${first.followers ?? '?'} (${first.stat_date}) → ${last.followers ?? '?'} (${last.stat_date})`);
  }
  if (!byChannel.size) lines.push('(snapshots start tonight — no rows yet)');

  lines.push('');
  lines.push('== UPCOMING BUFFER (next 7 days, prewritten, user can edit in Content Calendar) ==');
  for (const p of upcoming) {
    const slotTime = slots.length && p.linkedin_slot_index != null ? slots[p.linkedin_slot_index % slots.length] + ' IST' : '';
    lines.push(`${p.publish_date} ${slotTime} | ${p.status} | ${p.post_format} | ${p.content_theme ?? '-'} | ${p.product_key ?? '-'} | ${(p.blog_title ?? '').slice(0, 60)}`);
  }
  if (!upcoming.length) lines.push('(buffer empty)');

  return lines.join('\n');
}

const SYSTEM_PROMPT = `You are Arohan, the marketing intelligence of In-Sync (in-sync.co.in), a multi-product business platform for Indian SMBs. You started as an outreach engine and evolved: today In-Sync's marketing is a brand-led content pipeline — 4 posts/day (text/image/carousel/video) published as the In-Sync company page on LinkedIn, and to Facebook, Instagram (@insyncclm), and YouTube, all prewritten into a 7-day buffer the founder reviews in the Content Calendar.

You are talking to Amit, the founder (business user, not a developer). Your job: deep-dive analytics and strategy over the data provided — what is working, what isn't, and what to change.

Rules:
- Ground every claim in the numbers provided. Never invent metrics. If data is missing (nulls, "?"), say "not measured" — LinkedIn stats cover company-page posts AND the founder's personal-profile posts (via member analytics), Facebook has no view counts, YouTube views/likes/comments are metered nightly.
- Be specific and quantified ("carousels average 12 interactions vs 3 for text"), and note sample sizes when they're small — with a young channel, differences of a few interactions are noise, not signal.
- When asked for recommendations, give concrete, small, testable changes (formats, themes, slots, channels) the pipeline can act on. The user can edit or skip any buffered post in the Content Calendar.
- Plain business English, no API/technical jargon. Keep answers tight: lead with the answer, then the numbers behind it.
- You cannot change anything yourself — you advise; Amit (or Claude, his engineering agent) applies changes.`;

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return err(405, 'POST only');

  try {
    const body = (await req.json()) as ChatBody;
    const { org_id, thread_id } = body;
    const message = (body.message ?? '').trim();
    if (!org_id || !thread_id || !message) return err(400, 'org_id, thread_id, message required');

    const supabase = getSupabaseClient();

    const [{ data: history }, context] = await Promise.all([
      supabase
        .from('mkt_arohan_conversations')
        .select('role, message')
        .eq('org_id', org_id)
        .eq('thread_id', thread_id)
        .order('created_at', { ascending: true })
        .limit(20),
      buildContext(supabase, org_id),
    ]);

    await supabase.from('mkt_arohan_conversations').insert({
      org_id,
      thread_id,
      role: 'amit',
      message,
      is_suggestion: false,
      suggestion_payload: null,
    });

    const historyBlock = (history ?? [])
      .map((h: Row) => `${h.role === 'amit' ? 'Amit' : 'Arohan'}: ${h.message}`)
      .join('\n');

    const prompt =
      `CURRENT DATA (IST date ${new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10)}):\n${context}\n\n` +
      (historyBlock ? `CONVERSATION SO FAR:\n${historyBlock}\n\n` : '') +
      `Amit: ${message}\n\nArohan:`;

    const res = await callLLM(prompt, {
      model: 'sonnet',
      system: SYSTEM_PROMPT,
      max_tokens: 900,
      temperature: 0.4,
    });

    const reply = res.content.trim();

    await supabase.from('mkt_arohan_conversations').insert({
      org_id,
      thread_id,
      role: 'arohan',
      message: reply,
      is_suggestion: false,
      suggestion_payload: null,
    });

    return ok({ reply, is_suggestion: false, actions_triggered: [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[arohan-chat] fatal:', msg);
    return err(500, msg);
  }
});
