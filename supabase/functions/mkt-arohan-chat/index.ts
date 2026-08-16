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
 *
 * "Persona Post Idea" (2026-07-23): a message prefixed "Persona Post Idea"
 * (colon/dash optional) is Amit handing over context for his OWN LinkedIn
 * profile stream, not an analytics question. Arohan DEBATES the idea's fit
 * with him first (personaIdeaTurn() in _shared/personaVoice.ts) — genuine
 * pushback, not a rubber stamp — and only writes the post once the two of
 * them converge. The finished draft still lands as a 'pending' row Amit can
 * edit/skip in the Content Calendar, same "autonomous but human can
 * watch/intervene" pattern as the rest of the pipeline.
 *
 * "Post Idea <channels>: <context>" (2026-07-23): the multi-channel sibling
 * — a trend-jack in BRAND voice on a named subset of Facebook/Instagram/X
 * (never LinkedIn's stream, that's a separate concern). Same debate-then-
 * write pattern (trendPostTurn() in _shared/trendPost.ts), but per Amit's
 * explicit instruction this one publishes IMMEDIATELY once finalized —
 * no Content Calendar queue — because trend content stales out fast.
 *
 * "Weekly Outreach: ..." (2026-07-24): deterministic, LLM-extracted logging
 * of the 4 numbers Arohan's own recommendation says actually matter for the
 * persona stream (connection accepts from target titles, profile views, DMs
 * sent to post viewers, replies received) — none available via LinkedIn's
 * API, so Amit self-reports weekly. Stored in mkt_persona_outreach_metrics,
 * fed back into buildContext().
 */
import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { callLLM, callLLMJson } from '../_shared/llmClient.ts';
import { PERSONA_DAY_SEQ, PERSONA_SLOT_INDEX, personaIdeaTurn } from '../_shared/personaVoice.ts';
import { CHANNEL_ALIASES, CHANNEL_LABEL, TrendChannel, trendPostTurn } from '../_shared/trendPost.ts';
import { buildImagePrompt, generateGeminiImage } from '../_shared/geminiImage.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';

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
const xInt = (p: Row) => n(p.x_likes) + n(p.x_replies) + n(p.x_reposts);

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

// deno-lint-ignore no-explicit-any
async function buildContext(supabase: any, orgId: string): Promise<string> {
  const [postedRes, upcomingRes, followersRes, configRes, audienceRes, outreachRes] = await Promise.all([
    supabase
      .from('blog_posts')
      .select('publish_date, post_format, content_theme, product_key, blog_title, linkedin_impressions, linkedin_likes, linkedin_comments, linkedin_reposts, fb_likes, fb_comments, fb_shares, fb_clicks, ig_reach, ig_likes, ig_comments, ig_saves, ig_shares, yt_views, yt_likes, yt_comments, x_impressions, x_likes, x_replies, x_reposts, linkedin_url')
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
    supabase
      .from('mkt_linkedin_follower_demographics')
      .select('*')
      .eq('org_id', orgId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('mkt_persona_outreach_metrics')
      .select('*')
      .eq('org_id', orgId)
      .order('week_start', { ascending: false })
      .limit(6),
  ]);

  const posted: Row[] = postedRes.data ?? [];
  const upcoming: Row[] = upcomingRes.data ?? [];
  const followers: Row[] = followersRes.data ?? [];
  const slots: string[] = (configRes.data?.experiment_slots as string[]) ?? [];
  const audience: Row | null = audienceRes.data ?? null;
  const outreach: Row[] = outreachRes.data ?? [];

  const lines: string[] = [];

  lines.push('== POSTED CONTENT, LAST 30 DAYS (one line per post) ==');
  lines.push('date | format | theme | product | LI int/impr | FB int | IG int/reach | YT int/views | X int/impr | title');
  for (const p of posted) {
    lines.push(
      `${p.publish_date} | ${p.post_format ?? 'text'} | ${p.content_theme ?? '-'} | ${p.product_key ?? '-'} | ` +
      `${liInt(p)}/${p.linkedin_impressions ?? '?'} | ${fbInt(p)} | ${igInt(p)}/${p.ig_reach ?? '?'} | ` +
      `${ytInt(p)}/${p.yt_views ?? '?'} | ${xInt(p)}/${p.x_impressions ?? '?'} | ` +
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
      x: rows.reduce((s, p) => s + xInt(p), 0),
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
  lines.push(`Last 7d: ${wk.posts} posts, interactions LI ${wk.li} / FB ${wk.fb} / IG ${wk.ig} / YT ${wk.yt} / X ${wk.x}, LI impressions ${wk.impressions}, IG reach ${wk.reach}, YT views ${wk.views}`);
  lines.push(`Prior 7d: ${prevWk.posts} posts, interactions LI ${prevWk.li} / FB ${prevWk.fb} / IG ${prevWk.ig} / YT ${prevWk.yt} / X ${prevWk.x}, LI impressions ${prevWk.impressions}, IG reach ${prevWk.reach}, YT views ${prevWk.views}`);

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
  lines.push('== LINKEDIN AUDIENCE COMPOSITION (aggregate follower demographics, weekly snapshot) ==');
  lines.push('IMPORTANT: this is the demographic makeup of the WHOLE follower base, not per-post engagers. LinkedIn\'s API does not expose who specifically interacted with a given post (job title/seniority/industry/geo of individual engagers) at any access tier — verified against the official docs. This aggregate follower composition is the closest real signal available, and is what any Facebook targeting decision should be grounded in. There is also no API data on whether post impressions come from followers vs. non-followers — that split is not exposed either.');
  if (audience) {
    const top = (arr: unknown, n = 5) => Array.isArray(arr) ? (arr as { label: string; count: number }[]).slice(0, n).map((r) => `${r.label} (${r.count})`).join(', ') : '(none)';
    lines.push(`Snapshot: ${audience.snapshot_date}, ${audience.total_followers ?? '?'} followers`);
    lines.push(`Top seniority: ${top(audience.by_seniority)}`);
    lines.push(`Top job function: ${top(audience.by_function)}`);
    lines.push(`Top industry: ${top(audience.by_industry)}`);
    lines.push(`Top country: ${top(audience.by_country)}`);
  } else {
    lines.push('(no snapshot yet — syncs weekly; until one exists, do NOT recommend turning on a Meta/Facebook ad budget, there is no real audience signal to ground targeting in)');
  }

  lines.push('');
  lines.push('== WEEKLY OUTREACH METRICS (self-reported by Amit via "Weekly Outreach: ..." in this chat) ==');
  lines.push('These are the numbers that actually end in a demo — impressions do not. Not available via any API (LinkedIn does not expose connection-accept, profile-view, or DM data), so treat gaps as "not reported that week", never as zero.');
  if (outreach.length) {
    lines.push('week | connections accepted (target titles) | profile views | DMs sent to viewers | replies received');
    for (const w of [...outreach].reverse()) {
      lines.push(`${w.week_start} | ${w.connections_accepted_target_titles ?? '?'} | ${w.profile_views ?? '?'} | ${w.dms_sent_to_viewers ?? '?'} | ${w.replies_received ?? '?'}`);
    }
  } else {
    lines.push('(none logged yet — prompt Amit to start with "Weekly Outreach: ..." if he asks how the persona stream is doing)');
  }

  lines.push('');
  lines.push('== UPCOMING BUFFER (next 7 days, prewritten, user can edit in Content Calendar) ==');
  for (const p of upcoming) {
    const slotTime = slots.length && p.linkedin_slot_index != null ? slots[p.linkedin_slot_index % slots.length] + ' IST' : '';
    lines.push(`${p.publish_date} ${slotTime} | ${p.status} | ${p.post_format} | ${p.content_theme ?? '-'} | ${p.product_key ?? '-'} | ${(p.blog_title ?? '').slice(0, 60)}`);
  }
  if (!upcoming.length) lines.push('(buffer empty)');

  return lines.join('\n');
}

const SYSTEM_PROMPT = `You are Arohan, the marketing intelligence of In-Sync (in-sync.co.in), a multi-product business platform for Indian SMBs. You started as an outreach engine and evolved: today In-Sync's marketing is a brand-led content pipeline — 4 posts/day (text/image/carousel/video) published as the In-Sync company page on LinkedIn, and to Facebook, Instagram (@insyncclm), YouTube, and X (@insyncclm), all prewritten into a 7-day buffer the founder reviews in the Content Calendar. X posts are deliberately link-free (a URL multiplies X's pay-per-use posting cost ~13x).

You are talking to Amit, the founder (business user, not a developer). Your job: deep-dive analytics and strategy over the data provided — what is working, what isn't, and what to change.

Rules:
- Ground every claim in the numbers provided. Never invent metrics. If data is missing (nulls, "?"), say "not measured" — LinkedIn stats cover company-page posts AND the founder's personal-profile posts (via member analytics), Facebook has no view counts, YouTube views/likes/comments are metered nightly.
- Be specific and quantified ("carousels average 12 interactions vs 3 for text"), and note sample sizes when they're small — with a young channel, differences of a few interactions are noise, not signal.
- When asked for recommendations, give concrete, small, testable changes (formats, themes, slots, channels) the pipeline can act on. The user can edit or skip any buffered post in the Content Calendar.
- Plain business English, no API/technical jargon. Keep answers tight: lead with the answer, then the numbers behind it.
- If Amit asks about Facebook ad targeting, who the audience is, or whether to turn on Meta ad spend, ground your answer in the LINKEDIN AUDIENCE COMPOSITION section (aggregate follower demographics — top seniority/function/industry/country). Be explicit that this is follower-base composition, not per-post engager data (LinkedIn's API does not expose that at any tier). If no snapshot exists yet, say so plainly and advise against turning on a Meta budget until one lands.
- When discussing how the PERSONA stream (Amit's personal profile) is doing, lead with WEEKLY OUTREACH METRICS over impressions — connection accepts from target titles, profile views, DMs sent to viewers, and replies received are what actually end in a demo; impressions are noise and you should say so if Amit fixates on them. If no weeks are logged yet, suggest he start with "Weekly Outreach: ...".
- This chat displays your reply as plain text, not rendered markdown — NEVER use markdown syntax (no **bold**, no # headers, no - or * bullet lists, no backticks). Write in plain prose; use line breaks and numbered sentences ("First, ... Second, ...") instead of bullet points if you need to list things.
- You cannot change the analytics or strategy yourself — you advise; Amit (or Claude, his engineering agent) applies changes. Two exceptions, both handled outside this prompt: a message prefixed "Persona Post Idea" opens a debate-then-write flow for his personal profile; "Post Idea <channels>: ..." opens the same for an immediate multi-channel trend-jack post.`;

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

// ── "Persona Post Idea" (2026-07-23) ────────────────────────────────────────
// A message prefixed "Persona Post Idea" opens a debate thread (tracked via
// suggestion_payload.mode on Arohan's own reply rows, so plain follow-up
// messages with no prefix still continue the same debate). Arohan keeps
// discussing until it decides to write (converged) or abandon (Amit drops
// it) — see personaIdeaTurn() in _shared/personaVoice.ts for the judgment.

const IDEA_PREFIX = /^persona\s*post\s*idea\s*[:\-–]?\s*/i;

const SLOT_COUNT = 9; // mkt_linkedin_config.experiment_slots length — keep in sync with mkt-blog-writer

// Mirrors mkt-blog-writer's own tiny date helpers — not worth a shared module
// for two three-line functions used in one fallback path.
function istDate(offsetDays = 0): string {
  const ms = Date.now() + 5.5 * 3_600_000 + offsetDays * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function daysSince(dateStr: string, referenceDate: string): number {
  const start = new Date(dateStr + 'T00:00:00Z').getTime();
  const ref = new Date(referenceDate + 'T00:00:00Z').getTime();
  return Math.max(0, Math.floor((ref - start) / 86_400_000));
}

// IST calendar week (Mon-Sun) — matches mkt-social-boost/
// mkt-linkedin-follower-demographics's weekStartIST.
function weekStartIST(): string {
  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  const day = ist.getUTCDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  ist.setUTCDate(ist.getUTCDate() - diffToMonday);
  return ist.toISOString().slice(0, 10);
}

/**
 * Slots a finalized draft into the next upcoming persona post (the earliest
 * still-pending day_seq=4 row from today onward) so it posts at the very
 * next opportunity instead of waiting for the rotation. Falls back to
 * inserting a fresh row for tomorrow if the buffer somehow has no pending
 * persona row (shouldn't happen — mkt-blog-writer keeps 7 days topped up).
 */
// deno-lint-ignore no-explicit-any
async function queuePersonaDraft(
  supabase: any,
  orgId: string,
  ideaText: string,
  turn: { relevance: string; title?: string; post_text?: string },
): Promise<string> {
  const themeNote = `user idea: ${ideaText.slice(0, 80)}`;
  const strategyNote = `${turn.relevance} — user-suggested idea via Arohan chat`;

  const { data: target } = await supabase
    .from('blog_posts')
    .select('id, publish_date')
    .eq('org_id', orgId)
    .eq('channel', 'member')
    .eq('day_seq', PERSONA_DAY_SEQ)
    .eq('status', 'pending')
    .gte('publish_date', istDate(0))
    .order('publish_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (target) {
    const { error: updErr } = await supabase
      .from('blog_posts')
      .update({
        blog_title: turn.title,
        blog_excerpt: (turn.post_text ?? '').slice(0, 280),
        linkedin_draft_text: turn.post_text,
        content_theme: themeNote,
        content_angle: 'persona: user-suggested idea, first-person, never selling',
        content_strategy_note: strategyNote,
      })
      .eq('id', target.id);
    if (updErr) throw new Error(updErr.message);
    return target.publish_date;
  }

  const { data: config } = await supabase
    .from('mkt_linkedin_config')
    .select('start_date')
    .eq('org_id', orgId)
    .eq('active', true)
    .maybeSingle();
  if (!config) throw new Error('No active LinkedIn config for this org');

  const publishDate = istDate(1);
  const dayIndex = daysSince(config.start_date, publishDate);
  const { error: insErr } = await supabase.from('blog_posts').insert({
    org_id: orgId,
    channel: 'member',
    blog_url: `draft://member/${publishDate}/persona-idea`,
    product_key: null,
    publish_date: publishDate,
    day_seq: PERSONA_DAY_SEQ,
    status: 'pending',
    social_posted: false,
    posted_timestamp: new Date().toISOString(),
    linkedin_slot_index: PERSONA_SLOT_INDEX,
    linkedin_cycle: Math.floor(dayIndex / SLOT_COUNT) + 1,
    post_format: 'text',
    content_angle: 'persona: user-suggested idea, first-person, never selling',
    content_theme: themeNote,
    content_strategy_note: strategyNote,
    blog_title: turn.title,
    blog_excerpt: (turn.post_text ?? '').slice(0, 280),
    linkedin_draft_text: turn.post_text,
  });
  if (insErr) throw new Error(insErr.message);
  return publishDate;
}

// ── "Post Idea <channels>: <context>" (2026-07-23) ──────────────────────────
// Multi-channel trend-jack, same debate-continuation tracking pattern as
// Persona Post Idea (suggestion_payload.mode='trend_idea_debate'), but posts
// IMMEDIATELY on write — no Content Calendar queue.

const TREND_PREFIX = /^post\s*idea\b\s*/i;

function parseTrendChannels(text: string): TrendChannel[] {
  const tokens = text.toLowerCase().split(/[,/&]|(?:\band\b)/i).map((t) => t.trim()).filter(Boolean);
  const found = new Set<TrendChannel>();
  for (const t of tokens) {
    const canon = CHANNEL_ALIASES[t];
    if (canon) found.add(canon);
  }
  return Array.from(found);
}

/**
 * Creates the blog_posts record (so it shows up in the Content Calendar /
 * Social Performance dashboard / analytics like every other post) and posts
 * to each target channel directly, bypassing mkt-blog-poster's LinkedIn-
 * first slot-scheduled flow entirely — trend content has no LinkedIn leg and
 * no wait for a slot. Instagram is dropped (with a note) if image generation
 * fails, since IG cannot publish text-only.
 */
// deno-lint-ignore no-explicit-any
async function postTrendNow(
  supabase: any,
  orgId: string,
  channels: TrendChannel[],
  ideaText: string,
  turn: { relevance: string; title?: string; post_text?: string; image_keywords?: string[] },
): Promise<{ results: Record<string, string> }> {
  let imageUrl: string | null = null;

  if (channels.includes('instagram')) {
    try {
      const keywords = turn.image_keywords?.length ? turn.image_keywords : ['Indian business', 'growth', 'momentum'];
      const prompt = buildImagePrompt(keywords, 'Indian SMBs');
      imageUrl = await generateGeminiImage(prompt, '4:5', `trend/${orgId}/${Date.now()}`);
    } catch (e) {
      console.warn('[arohan-chat] trend image gen failed:', e instanceof Error ? e.message : String(e));
    }
  }

  const { data: row, error: insErr } = await supabase
    .from('blog_posts')
    .insert({
      org_id: orgId,
      channel: 'company',
      blog_url: `draft://trend/${istDate(0)}/${crypto.randomUUID()}`,
      product_key: null,
      publish_date: istDate(0),
      day_seq: null,
      status: 'pending',
      social_posted: false,
      posted_timestamp: new Date().toISOString(),
      post_format: imageUrl ? 'image' : 'text',
      content_angle: 'trend-jack: user-suggested via Arohan chat, immediate post',
      content_theme: `trend: ${ideaText.slice(0, 80)}`,
      content_strategy_note: `${turn.relevance} — trend-jack, channels: ${channels.map((c) => CHANNEL_LABEL[c]).join(', ')}`,
      blog_title: turn.title,
      blog_excerpt: (turn.post_text ?? '').slice(0, 280),
      linkedin_draft_text: turn.post_text,
      linkedin_short_caption: turn.post_text,
      image_url: imageUrl,
    })
    .select('id')
    .single();
  if (insErr) throw new Error(insErr.message);

  const FN_FOR: Record<TrendChannel, string> = {
    facebook: 'mkt-social-facebook',
    instagram: 'mkt-social-instagram',
    x: 'mkt-social-x',
  };
  const supaUrl = Deno.env.get('SUPABASE_URL');
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const headers = { Authorization: `Bearer ${svcKey}`, 'Content-Type': 'application/json' };
  const body = JSON.stringify({ blog_post_id: row.id });

  const results: Record<string, string> = {};
  for (const c of channels) {
    if (c === 'instagram' && !imageUrl) { results[c] = 'skipped (no image)'; continue; }
    try {
      const res = await fetch(`${supaUrl}/functions/v1/${FN_FOR[c]}`, { method: 'POST', headers, body, signal: AbortSignal.timeout(90_000) });
      const json = await res.json().catch(() => ({} as Record<string, unknown>));
      results[c] = res.ok && !json.error ? 'posted' : `failed (${String(json.error ?? res.status)})`;
    } catch (e) {
      results[c] = `failed (${e instanceof Error ? e.message : String(e)})`;
    }
  }

  const anyPosted = Object.values(results).some((v) => v === 'posted');
  await supabase
    .from('blog_posts')
    .update({
      status: anyPosted ? 'posted' : 'pending',
      social_posted: anyPosted,
      error_message: anyPosted ? null : JSON.stringify(results),
    })
    .eq('id', row.id);

  return { results };
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

    // ── "Ad Budget <channel>: <amount>" — the one human-only lever for the
    // autonomous paid-ads engine (mkt-ad-campaign-generator). Deterministic,
    // no debate: budget is Amit's call, not something for Arohan to weigh in
    // on. "off"/"pause"/"0" disables that channel without discarding the
    // configured amount, so re-enabling later doesn't need the number again.
    const adBudgetMatch = message.match(/^ad\s*budget\s+(google|meta)\b\s*[:\-–]?\s*(.*)$/i);
    if (adBudgetMatch) {
      const channel = adBudgetMatch[1].toLowerCase() as 'google' | 'meta';
      const rest = adBudgetMatch[2].trim();
      const isOff = /^(off|pause|stop|0)$/i.test(rest);
      const numMatch = rest.match(/[\d,]+(\.\d+)?/);

      if (!isOff && !numMatch) {
        const reply = `What's the daily budget for ${channel === 'google' ? 'Google Ads' : 'Meta Ads'}? e.g. "Ad Budget ${channel === 'google' ? 'Google' : 'Meta'}: 500" (₹/day), or "off" to pause it.`;
        await supabase.from('mkt_arohan_conversations').insert({
          org_id, thread_id, role: 'amit', message, is_suggestion: false, suggestion_payload: null,
        });
        await supabase.from('mkt_arohan_conversations').insert({
          org_id, thread_id, role: 'arohan', message: reply, is_suggestion: false, suggestion_payload: null,
        });
        return ok({ reply, is_suggestion: false, actions_triggered: [] });
      }

      const { data: existingRow } = await supabase
        .from('mkt_engine_config')
        .select('config_value')
        .eq('org_id', org_id)
        .eq('config_key', 'paid_ads_budget')
        .maybeSingle();
      const existing = (existingRow?.config_value as Record<string, { daily_budget: number; active: boolean }>) ?? {};

      const dailyBudget = isOff
        ? (existing[channel]?.daily_budget ?? 0)
        : parseFloat(numMatch![0].replace(/,/g, ''));
      const updated = { ...existing, [channel]: { daily_budget: dailyBudget, active: !isOff } };

      const { error: cfgErr } = await supabase
        .from('mkt_engine_config')
        .upsert({ org_id, config_key: 'paid_ads_budget', config_value: updated }, { onConflict: 'org_id,config_key' });

      const channelLabel = channel === 'google' ? 'Google Ads' : 'Meta Ads';
      const reply = cfgErr
        ? `Couldn't save that: ${cfgErr.message}`
        : isOff
          ? `${channelLabel} paused — the engine won't launch or continue any campaign there until you turn it back on.`
          : `${channelLabel} budget set to ₹${dailyBudget}/day. The engine will pick up from here on its own — I'll launch, run, and retire campaigns within that budget, and let you know here if anything needs your attention.`;

      await supabase.from('mkt_arohan_conversations').insert({
        org_id, thread_id, role: 'amit', message, is_suggestion: false, suggestion_payload: null,
      });
      await supabase.from('mkt_arohan_conversations').insert({
        org_id, thread_id, role: 'arohan', message: reply, is_suggestion: !cfgErr,
        suggestion_payload: cfgErr ? null : { mode: 'ad_budget_set', channel, daily_budget: dailyBudget, active: !isOff },
      });
      return ok({
        reply,
        is_suggestion: !cfgErr,
        actions_triggered: cfgErr ? [] : [{ type: 'ad_budget_updated', details: { channel, daily_budget: dailyBudget, active: !isOff } }],
      });
    }

    // ── "Weekly Outreach: ..." (2026-07-24, Arohan recommendation) ─────────
    // None of these four numbers are available via LinkedIn's API — Amit
    // self-reports them weekly, LLM-extracted from freeform phrasing so he
    // doesn't need to match an exact format. "Change what you're tracking":
    // connection accepts from target titles / profile views / DMs sent to
    // post viewers / replies received are the numbers that end in a demo;
    // impressions are noise. Stored one row per ISO week, fed into buildContext.
    const outreachMatch = message.match(/^weekly\s*outreach\b\s*[:\-–]?\s*(.*)$/i);
    if (outreachMatch) {
      const rest = outreachMatch[1].trim();
      if (!rest) {
        const reply = 'What are this week\'s numbers? Connection requests accepted from your target titles, profile views, DMs sent to post viewers, and replies received — e.g. "Weekly Outreach: 8 connections, 40 profile views, 12 DMs, 3 replies". Leave any you don\'t have out, that\'s fine.';
        await supabase.from('mkt_arohan_conversations').insert({ org_id, thread_id, role: 'amit', message, is_suggestion: false, suggestion_payload: null });
        await supabase.from('mkt_arohan_conversations').insert({ org_id, thread_id, role: 'arohan', message: reply, is_suggestion: false, suggestion_payload: null });
        return ok({ reply, is_suggestion: false, actions_triggered: [] });
      }

      const extractPrompt = `Extract weekly LinkedIn outreach numbers from this message. It may use casual phrasing or only mention some of the four numbers.

MESSAGE: "${rest}"

Fields: connections_accepted_target_titles (connection requests accepted, specifically from his target buyer titles — CFOs/finance controllers/AP/procurement), profile_views (his own profile views), dms_sent_to_viewers (DMs he sent to people who viewed/reacted to a post), replies_received (replies he got back from any outreach).

Return JSON: {"connections_accepted_target_titles": <int or null if not mentioned>, "profile_views": <int or null>, "dms_sent_to_viewers": <int or null>, "replies_received": <int or null>}`;

      try {
        const { data: extracted } = await callLLMJson<Record<string, number | null>>(extractPrompt, { model: 'haiku', max_tokens: 200, temperature: 0 });
        const weekStart = weekStartIST();

        const { error: upsertErr } = await supabase.from('mkt_persona_outreach_metrics').upsert({
          org_id,
          week_start: weekStart,
          connections_accepted_target_titles: extracted?.connections_accepted_target_titles ?? null,
          profile_views: extracted?.profile_views ?? null,
          dms_sent_to_viewers: extracted?.dms_sent_to_viewers ?? null,
          replies_received: extracted?.replies_received ?? null,
        }, { onConflict: 'org_id,week_start' });

        const reply = upsertErr
          ? `Couldn't save that: ${upsertErr.message}`
          : `Logged for the week of ${weekStart}: ${extracted?.connections_accepted_target_titles ?? '—'} target-title connections accepted, ${extracted?.profile_views ?? '—'} profile views, ${extracted?.dms_sent_to_viewers ?? '—'} DMs sent to viewers, ${extracted?.replies_received ?? '—'} replies. I'll factor this into how I read the content performance from here.`;

        await supabase.from('mkt_arohan_conversations').insert({ org_id, thread_id, role: 'amit', message, is_suggestion: false, suggestion_payload: null });
        await supabase.from('mkt_arohan_conversations').insert({ org_id, thread_id, role: 'arohan', message: reply, is_suggestion: !upsertErr, suggestion_payload: null });
        return ok({ reply, is_suggestion: !upsertErr, actions_triggered: upsertErr ? [] : [{ type: 'weekly_outreach_logged', details: { week_start: weekStart } }] });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return err(500, msg);
      }
    }

    const [{ data: recentHistory }, context] = await Promise.all([
      // Most recent 20 messages — fetched newest-first (so LIMIT actually
      // keeps the tail of a long thread) then reversed back to chronological.
      supabase
        .from('mkt_arohan_conversations')
        .select('role, message, suggestion_payload')
        .eq('org_id', org_id)
        .eq('thread_id', thread_id)
        .order('created_at', { ascending: false })
        .limit(20),
      buildContext(supabase, org_id),
    ]);
    const history = (recentHistory ?? []).slice().reverse();

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

    // Continue an open debate even without the prefix (natural back-and-forth);
    // only a fresh prefixed message can START one.
    const lastMsg: Row | null = history && history.length ? history[history.length - 1] : null;
    const openDebate = lastMsg?.role === 'arohan' && lastMsg.suggestion_payload?.mode === 'persona_idea_debate'
      ? (lastMsg.suggestion_payload as { idea_text: string })
      : null;
    const prefixMatch = IDEA_PREFIX.test(message);

    if (openDebate || prefixMatch) {
      const originalIdea = openDebate ? openDebate.idea_text : message.replace(IDEA_PREFIX, '').trim();

      if (!originalIdea) {
        const reply = "What's the idea or context you want on your profile? Give me the gist and I'll weigh in.";
        await supabase.from('mkt_arohan_conversations').insert({
          org_id, thread_id, role: 'arohan', message: reply, is_suggestion: false, suggestion_payload: null,
        });
        return ok({ reply, is_suggestion: false, actions_triggered: [] });
      }

      const { data: recent } = await supabase
        .from('blog_posts')
        .select('blog_title')
        .eq('org_id', org_id)
        .eq('channel', 'member')
        .order('publish_date', { ascending: false })
        .limit(14);
      const recentTitles = (recent ?? []).map((r: Row) => r.blog_title as string).filter(Boolean);

      const turn = await personaIdeaTurn(originalIdea, historyBlock, message, recentTitles);

      if (turn.action === 'write') {
        const publishDate = await queuePersonaDraft(supabase, org_id, originalIdea, turn);
        const reply =
          `${turn.reply}\n\n"${turn.post_text}"\n\n` +
          `Queued for ${publishDate} (08:30 IST) — it's sitting as pending in your Content Calendar, edit or skip it there if you don't want it to go out.`;
        await supabase.from('mkt_arohan_conversations').insert({
          org_id, thread_id, role: 'arohan', message: reply, is_suggestion: true,
          suggestion_payload: { mode: 'persona_idea_written', publish_date: publishDate, relevance: turn.relevance },
        });
        return ok({
          reply,
          is_suggestion: true,
          actions_triggered: [{ type: 'persona_idea_draft_queued', details: { publish_date: publishDate, relevance: turn.relevance } }],
        });
      }

      if (turn.action === 'abandon') {
        await supabase.from('mkt_arohan_conversations').insert({
          org_id, thread_id, role: 'arohan', message: turn.reply, is_suggestion: false, suggestion_payload: null,
        });
        return ok({ reply: turn.reply, is_suggestion: false, actions_triggered: [] });
      }

      // "discuss" — keep the debate open for the next message
      await supabase.from('mkt_arohan_conversations').insert({
        org_id, thread_id, role: 'arohan', message: turn.reply, is_suggestion: true,
        suggestion_payload: { mode: 'persona_idea_debate', idea_text: originalIdea },
      });
      return ok({ reply: turn.reply, is_suggestion: true, actions_triggered: [] });
    }

    // ── "Post Idea <channels>: <context>" — multi-channel trend-jack ───────
    const trendOpenDebate = lastMsg?.role === 'arohan' && lastMsg.suggestion_payload?.mode === 'trend_idea_debate'
      ? (lastMsg.suggestion_payload as { idea_text: string; channels: TrendChannel[] })
      : null;
    const trendPrefixMatch = TREND_PREFIX.test(message);

    if (trendOpenDebate || trendPrefixMatch) {
      let channels: TrendChannel[];
      let originalIdea: string;

      if (trendOpenDebate) {
        channels = trendOpenDebate.channels;
        originalIdea = trendOpenDebate.idea_text;
      } else {
        const rest = message.replace(TREND_PREFIX, '');
        const colonIdx = rest.indexOf(':');
        const channelPart = colonIdx === -1 ? rest : rest.slice(0, colonIdx);
        channels = parseTrendChannels(channelPart);
        originalIdea = (colonIdx === -1 ? '' : rest.slice(colonIdx + 1)).trim();

        if (!channels.length || !originalIdea) {
          const reply = 'Tell me which channels and the idea, like: "Post Idea Facebook, Instagram, X: <what\'s the trend/context>". Supported channels right now: Facebook, Instagram, X (LinkedIn stays on its own stream).';
          await supabase.from('mkt_arohan_conversations').insert({
            org_id, thread_id, role: 'arohan', message: reply, is_suggestion: false, suggestion_payload: null,
          });
          return ok({ reply, is_suggestion: false, actions_triggered: [] });
        }
      }

      const turn = await trendPostTurn(channels, originalIdea, historyBlock, message);
      const channelLabels = channels.map((c) => CHANNEL_LABEL[c]).join(', ');

      if (turn.action === 'write') {
        const { results } = await postTrendNow(supabase, org_id, channels, originalIdea, turn);
        const resultLines = channels.map((c) => `${CHANNEL_LABEL[c]}: ${results[c] ?? 'skipped'}`).join('\n');
        const reply = `${turn.reply}\n\n"${turn.post_text}"\n\nPosted now (${channelLabels}) —\n${resultLines}`;
        await supabase.from('mkt_arohan_conversations').insert({
          org_id, thread_id, role: 'arohan', message: reply, is_suggestion: true,
          suggestion_payload: { mode: 'trend_idea_posted', channels, relevance: turn.relevance, results },
        });
        return ok({
          reply,
          is_suggestion: true,
          actions_triggered: [{ type: 'trend_post_published', details: { channels, relevance: turn.relevance, results } }],
        });
      }

      if (turn.action === 'abandon') {
        await supabase.from('mkt_arohan_conversations').insert({
          org_id, thread_id, role: 'arohan', message: turn.reply, is_suggestion: false, suggestion_payload: null,
        });
        return ok({ reply: turn.reply, is_suggestion: false, actions_triggered: [] });
      }

      // "discuss" — keep the debate open for the next message
      await supabase.from('mkt_arohan_conversations').insert({
        org_id, thread_id, role: 'arohan', message: turn.reply, is_suggestion: true,
        suggestion_payload: { mode: 'trend_idea_debate', idea_text: originalIdea, channels },
      });
      return ok({ reply: turn.reply, is_suggestion: true, actions_triggered: [] });
    }

    // ── Normal analytics chat ──────────────────────────────────────────────
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
