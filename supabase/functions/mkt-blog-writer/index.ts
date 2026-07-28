/**
 * mkt-blog-writer — Arohan's content generation step.
 *
 * Maintains a PREWRITTEN BUFFER: 1 post per day for every day in the next
 * 7 days (7 drafts), so a human can review and intervene well before
 * anything goes live. Runs every 30 minutes (cron: star-slash-30 UTC) and tops the
 * buffer up by ONE draft per invocation (media generation is heavy — a video
 * draft can take ~2 minutes), oldest gap first. When the buffer is full it
 * exits immediately.
 *
 * Every post is grounded in a LIVE web search finding (researchThemeFact),
 * not the writer LLM's own recall — the 30-day baseline before this (2026-07-28)
 * showed stats like a 2012 study cited as current, because the model was never
 * actually looking anything up, just producing something plausible-sounding.
 *
 * Each draft carries its own day_seq (0-3, position within the day) and
 * linkedin_slot_index (posting time). Product/format/angle rotate on the
 * global post sequence (day_index*4 + day_seq).
 *
 * Images: Gemini AI generation is the PRIMARY source (Indian-context
 * editorial photography); Pexels stock is the fallback only.
 *
 * A separate function (mkt-blog-poster) publishes each draft to LinkedIn
 * (+ Facebook, Instagram, YouTube) at its slot time.
 *
 * Can also be triggered manually by Arohan chat (force=true, product_key optional).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callLLMJson } from '../_shared/llmClient.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { renderSlideImage } from '../_shared/slideImage.ts';
import { uploadToMarketingR2 } from '../_shared/r2Marketing.ts';
import { buildImagePrompt, generateGeminiImage, GeminiAspect, ImageStyle, IMAGE_STYLES } from '../_shared/geminiImage.ts';
import { brandImageUrl, LOGO_MARK_URL } from '../_shared/brandLogo.ts';
import { PERSONA_DAY_SEQ, PERSONA_SLOT_INDEX, PERSONA_BACKSTORY, generatePersonaPost } from '../_shared/personaVoice.ts';
import { BRAND_STORY } from '../_shared/brandVoice.ts';
import { generatePoll } from '../_shared/pollVoice.ts';

const LINKEDIN_ORG_ID = Deno.env.get('LINKEDIN_ORG_ID') || '35932282';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30

const POSTS_PER_DAY = 1;   // one considered post/day beats several competing with each other (2026-07-28, engagement-quality decision)
const BUFFER_DAYS = 7;     // content prewritten at least a week ahead
const SLOT_COUNT = 9;      // mkt_linkedin_config.experiment_slots length

// Format rotation across days. 'product' added 2026-07-28: every other format
// here is brand-story thought-leadership where the product gets one soft
// mention — this is the one slot per cycle that actually shows the real,
// live product screen and names a specific feature, so the feed isn't 100%
// "flexing" with nothing concrete behind it.
const FORMAT_CYCLE = ['text', 'image', 'carousel', 'poll', 'product', 'image', 'carousel', 'video', 'carousel'] as const;
type PostFormat = typeof FORMAT_CYCLE[number];
const CAROUSEL_SLIDE_COUNT = 8;

// Real, live screenshots of each product's own site (captured by
// synthetic-monitor/capture-product-screenshots.mjs, refresh periodically as
// the products' UIs change) — never an AI-generated stock photo standing in
// for the actual app.
const PRODUCT_SCREENSHOT_BASE = 'https://crm-marketing-store.echocommunicator.workers.dev/product-screenshots';
function productScreenshotUrl(productKey: string): string {
  return `${PRODUCT_SCREENSHOT_BASE}/${productKey}.jpg`;
}

// ── Time helpers ──────────────────────────────────────────────────────────────

function getIST(offsetDays = 0) {
  const ms = Date.now() + IST_OFFSET_MS + offsetDays * 86_400_000;
  const d = new Date(ms);
  return { date: d.toISOString().slice(0, 10) };
}

// 0=Sun..6=Sat, IST. Used to gate the persona stream to weekdays only
// (2026-07-24, Arohan recommendation: daily posting is unsustainable at
// save-worthy quality — drop to a 5-day business-week cadence).
function istDayOfWeek(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00Z').getUTCDay();
}

function daysSince(dateStr: string, referenceDate: string): number {
  const start = new Date(dateStr + 'T00:00:00Z').getTime();
  const ref = new Date(referenceDate + 'T00:00:00Z').getTime();
  return Math.max(0, Math.floor((ref - start) / 86_400_000));
}

// ── Pexels + Shotstack media ───────────────────────────────────────────────────

/**
 * Fetch a portrait-orientation photo from Pexels matching the blog keywords.
 * Returns the large portrait image URL, or null if unavailable.
 */
async function fetchPexelsImage(keywords: string[]): Promise<string | null> {
  const key = Deno.env.get('PEXELS_API_KEY');
  if (!key || !keywords.length) return null;

  const query = keywords.slice(0, 3).join(' ');
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=5&size=large`,
      { headers: { 'Authorization': key }, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const photo = data?.photos?.[0];
    // portrait src is pre-cropped for vertical — ideal for Instagram
    return photo?.src?.portrait || photo?.src?.large || null;
  } catch (e) {
    console.warn('[blog-writer] Pexels image fetch failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Fetch a portrait-orientation video clip from Pexels matching the blog keywords.
 * Prefers HD portrait (h > w) MP4 files — correct format for Reels and YouTube Shorts.
 * Returns the direct MP4 URL, or null if unavailable.
 */
async function fetchPexelsVideo(keywords: string[]): Promise<string | null> {
  const key = Deno.env.get('PEXELS_API_KEY');
  if (!key || !keywords.length) return null;

  const query = keywords.slice(0, 3).join(' ');
  try {
    const res = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=5`,
      { headers: { 'Authorization': key }, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const videos: Array<{
      video_files: Array<{ width: number; height: number; quality: string; file_type: string; link: string }>;
    }> = data?.videos || [];

    for (const video of videos) {
      const files = (video.video_files || [])
        .filter((f) => f.file_type === 'video/mp4' && f.height > f.width) // portrait only
        .sort((a, b) => {
          // Prefer HD, then by height descending
          if (a.quality === 'hd' && b.quality !== 'hd') return -1;
          if (b.quality === 'hd' && a.quality !== 'hd') return 1;
          return b.height - a.height;
        });
      if (files.length) return files[0].link;
    }

    // Fallback: first file from first video regardless of orientation
    const fallback = videos[0]?.video_files?.find((f) => f.file_type === 'video/mp4');
    return fallback?.link || null;
  } catch (e) {
    console.warn('[blog-writer] Pexels video fetch failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Compose a branded 20-second vertical video using Shotstack.
 * Uses the Pexels image as the background with a slow zoom + title overlay.
 * Output: 1080×1920 MP4 — correct for YouTube Shorts and Instagram Reels.
 * Falls back to null (caller will try Pexels raw video instead).
 */
async function generateShotstackVideo(imageUrl: string, title: string): Promise<string | null> {
  const apiKey = Deno.env.get('SHOTSTACK_API_KEY');
  if (!apiKey) return null;

  // Truncate title to fit cleanly on screen
  const displayTitle = title.length > 80 ? title.slice(0, 77) + '...' : title;

  const payload = {
    timeline: {
      background: '#000000',
      tracks: [
        // Track 1 (bottom): Pexels image with slow zoom
        {
          clips: [
            {
              asset: { type: 'image', src: imageUrl },
              start: 0,
              length: 20,
              effect: 'zoomIn',
              fit: 'cover',
            },
          ],
        },
        // Track 2 (middle): Title text — fade in at 1.5s, hold, fade out
        {
          clips: [
            {
              asset: {
                type: 'title',
                text: displayTitle,
                style: 'minimal',
                color: '#ffffff',
                size: 'medium',
              },
              start: 1.5,
              length: 15,
              position: 'center',
              transition: { in: 'fade', out: 'fade' },
            },
          ],
        },
        // Track 3 (top): In-Sync logo mark, fixed top-right for the full
        // clip — brand recall that survives the background's zoom/pan.
        {
          clips: [
            {
              asset: { type: 'image', src: LOGO_MARK_URL },
              start: 0,
              length: 20,
              fit: 'none',
              scale: 0.14,
              position: 'topRight',
              offset: { x: -0.05, y: 0.05 },
              opacity: 0.92,
            },
          ],
        },
      ],
    },
    output: {
      format: 'mp4',
      size: { width: 1080, height: 1920 },
      fps: 25,
    },
  };

  // Submit render job
  const submitRes = await fetch('https://api.shotstack.io/edit/v1/render', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });

  if (!submitRes.ok) {
    throw new Error(`Shotstack submit ${submitRes.status}: ${await submitRes.text()}`);
  }

  const submitData = await submitRes.json();
  const renderId = submitData?.response?.id;
  if (!renderId) throw new Error('Shotstack returned no render ID');

  console.log(`[blog-writer] Shotstack render submitted: ${renderId}`);

  // Poll for completion — renders typically take 15-40s
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5_000));
    const pollRes = await fetch(`https://api.shotstack.io/edit/v1/render/${renderId}`, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    const pollData = await pollRes.json();
    const status: string = pollData?.response?.status || '';
    const url: string = pollData?.response?.url || '';

    if (status === 'done' && url) {
      console.log(`[blog-writer] Shotstack render complete: ${url}`);
      return url;
    }
    if (status === 'failed') {
      throw new Error(`Shotstack render failed: ${JSON.stringify(pollData?.response?.error)}`);
    }
    console.log(`[blog-writer] Shotstack ${renderId}: ${status} (poll ${i + 1}/24)`);
  }

  throw new Error('Shotstack render timed out after 2 minutes');
}

// ── Blog generation ───────────────────────────────────────────────────────────

interface BlogDraft {
  title: string;
  full_post: string;    // complete LinkedIn post text ≤2800 chars
  teaser: string;       // hook lines only, for blog_excerpt
  image_keywords: string[];
  strategy_note: string; // 2-3 sentences: why this angle, what data/logic anchors it
  sources?: SourceRef[]; // links to the reports/surveys quoted in the post
}

// ── Source links (2026-07-15 user requirement) ──────────────────────────────
// Quoted survey/report stats must carry a real link — it reads as authentic.
// The LLM proposes sources; we verify each URL actually resolves before
// appending it, so a hallucinated link never reaches a live post. A stat whose
// link fails verification keeps its inline named attribution only.

interface SourceRef { label: string; url: string }

const SOURCE_JSON_FIELD = `"sources": [{"label": "report/survey name, publisher, year", "url": "https://direct-public-link-to-the-report-or-a-page-about-it"}] — 1-2 entries, ONLY for reports/surveys actually quoted in the content. Only give URLs you are confident really exist and are publicly accessible; each will be machine-verified and silently dropped if it does not resolve, so a guessed URL just loses you the citation.`;

const NUMERIC_CLAIMS_RULE = `Prefer quantified statements over vague comparatives wherever the underlying research supports one — write "37% more", "2.4x faster", "11 hours a week", never "more", "faster", "a lot". Never invent a number: quantify only what the cited source actually measured.`;

async function verifiedSourceLines(sources: SourceRef[] | undefined): Promise<string> {
  if (!Array.isArray(sources) || !sources.length) return '';
  const checks = await Promise.all(sources.slice(0, 3).map(async (s) => {
    if (!s?.url || !s?.label || !/^https?:\/\//i.test(s.url)) return null;
    try {
      const res = await fetch(s.url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(8_000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InSyncBot/1.0)' },
      });
      return res.ok ? s : null;
    } catch {
      return null;
    }
  }));
  const good = checks.filter((s): s is SourceRef => s !== null);
  if (!good.length) return '';
  return '\n\n' + good.map((s) => `Source: ${s.label} — ${s.url}`).join('\n');
}

// ── Live research grounding (2026-07-28) ────────────────────────────────────
// The writer prompt used to just tell the LLM to "cite a real statistic" and
// trust its training-data recall — which is how a 2012 stat ended up quoted
// as if it were fresh. This does an actual web search per post and hands the
// writer a real, dated finding to build around instead of hoping it recalls
// something both true and current.

interface ResearchFinding {
  finding: string;
  is_live_trend: boolean; // a genuinely current story/debate/news item, vs. a timeless supporting statistic
  source_label: string;
  source_url: string;
}

/**
 * Searches for something happening THIS WEEK first — a real news item, a
 * debate, a launch, a regulatory change, a viral discussion — and only falls
 * back to a timeless supporting statistic if nothing current turns up. A
 * post built around "what people following this space are actually talking
 * about right now" reads as engaged; one built around a static, evergreen
 * stat reads as generic no matter how well-sourced the stat is.
 */
async function researchThemeFact(
  themeHint: string,
  industries: string,
  designations: string,
): Promise<ResearchFinding | null> {
  const prompt = `Search the web for something to anchor a LinkedIn post for a B2B audience of ${designations} in ${industries}, on this theme:

"${themeHint}"

PRIORITY ORDER (search for the first, only fall back to the second if nothing turns up):
1. A genuinely CURRENT trend, news item, debate, launch, regulatory change, or discussion from the LAST 2-4 WEEKS that this audience would recognize or have an opinion on — something that makes the post feel like it was written by someone actually paying attention to the world this week, not a timeless observation that could have been posted any month this year.
2. If nothing sufficiently current and relevant exists, a real, specific, quantified statistic or survey result from the last 18 months (a percentage, a rupee/dollar figure, hours saved, a named recent event) from a credible named source (Gartner, McKinsey, NASSCOM, RBI, Forrester, a recent industry survey, a named company's public numbers).

Requirements either way:
- Must be real and verifiable — search first, do not answer from memory.
- Must be recent enough to feel current, not a decade-old figure that has been repeated everywhere.
- Never invent a source or a number.

Return JSON only:
{"finding": "one or two sentences stating what you found, in plain English, as it should be referenced in a LinkedIn post", "is_live_trend": true or false — true only if this is a genuinely current news/trend item (priority 1), false if it's a timeless supporting statistic (priority 2), "source_label": "publisher/outlet name, year or date", "source_url": "the direct URL you found it at"}`;

  // callLLM's own retry/backoff on a slow or rate-limited call can legitimately
  // run 60-100+s on its own (up to 3 attempts, each with its own 30s fetch
  // timeout, plus backoff between them) — far too much of this function's
  // 150s total budget for one optional research step. Race it against a hard
  // ceiling independent of that retry logic; a timeout here just means the
  // post falls back to the writer's own recall, not a lost draft.
  const RESEARCH_TIMEOUT_MS = 25_000;
  try {
    const { data } = await Promise.race([
      callLLMJson<ResearchFinding>(prompt, {
        model: 'sonnet',
        max_tokens: 800,
        temperature: 0.3,
        webSearch: true,
        maxSearchUses: 3,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('research step exceeded time budget')), RESEARCH_TIMEOUT_MS)),
    ]);
    if (!data?.finding || !data?.source_url) return null;
    return data;
  } catch (e) {
    console.warn('[blog-writer] research step failed or timed out, falling back to model recall:', e instanceof Error ? e.message : e);
    return null;
  }
}

function researchBlock(finding: ResearchFinding | null): string {
  if (!finding) {
    return `No live research finding was available for this post — fall back to a real, well-known statistic from published research (Gartner, McKinsey, NASSCOM, RBI, Forrester) that you are confident actually exists. Do NOT invent one.`;
  }
  if (finding.is_live_trend) {
    return `TODAY'S LIVE TREND (found via web search moments ago — this is something genuinely happening right now; OPEN the post with this, as a live observation, not a footnote — that is what makes this read as engaged rather than scheduled):
${finding.finding}
Source: ${finding.source_label} — ${finding.source_url}`;
  }
  return `TODAY'S RESEARCH FINDING (found via live web search moments ago — build the post around THIS, do not invent or recall a different statistic):
${finding.finding}
Source: ${finding.source_label} — ${finding.source_url}`;
}

// ── Brand-led strategy (2026-07-15) ─────────────────────────────────────────
// Every post promotes the In-Sync PLATFORM story; individual products appear
// only as proof points inside the narrative, never as standalone offerings.
// BRAND_STORY now lives in _shared/brandVoice.ts (also used by the "Post
// Idea" trend-jack flow in mkt-arohan-chat) — single source of truth.

// The brand story pillars. Rotates per post (like angle/format) so the week
// covers the whole story; stored on the row as content_theme for review.
// 'build story' added 2026-07-28: every other theme argues an abstract
// corporate point; this one tells the company's own real, specific building
// journey — the same category of content (genuine story, not argument) that
// is measurably outperforming on Amit's personal profile.
const CONTENT_THEMES = [
  'operational efficiency: work should flow through one system instead of being retyped, forwarded, and chased across disconnected tools',
  'cost of fragmentation (loss): the silent leaks — enquiries that die in WhatsApp groups, payments that slip, hours burned reconciling tools that do not talk to each other',
  'brand image: slow replies, missed follow-ups, and inconsistent customer experience quietly teach customers the business is not reliable',
  'team alignment: everyone working from one truth — same contacts, same status, same priorities — instead of private spreadsheets and forgotten threads',
  'productivity: fewer tools, fewer tabs, fewer handoffs — people spend their day on customers, not on coordination',
  'build story: a real, specific chapter of how In-Sync itself got built and rebuilt — told in the BRAND\'s voice (about the company and its founder), not a generic case study',
];
function themeFor(postSeq: number): string {
  return CONTENT_THEMES[postSeq % CONTENT_THEMES.length];
}

// When today's theme is 'build story', hand the writer the same approved,
// real facts the persona stream draws on (PERSONA_BACKSTORY) so the story is
// true and specific rather than a vague "we scaled our platform" gesture —
// just told about the company/founder in third person, not first-person Amit
// (that voice is reserved for his own profile).
function buildStoryContext(themeHint: string): string {
  if (!themeHint.startsWith('build story')) return '';
  return `\nREAL FACTS TO DRAW FROM for this build story (never invent beyond these; write about the company/founder in third person, e.g. "In-Sync's founder" or "the team", not first-person "I"):\n${PERSONA_BACKSTORY}\n`;
}

// Rotating content angle, shared across every format so a reviewer can see the
// same "why" regardless of whether that day's post is text/image/video/carousel.
// 2026-07-24 (engagement-quality feedback — 30-day baseline was ~62 avg
// impressions, ~0 comments; target is 200+ with real comment volume):
// sharpened "story-focused" into an explicit case-study structure, and
// "myth-busting" into something that actually risks disagreement rather
// than a safe strawman.
const CONTENT_ANGLES = [
  'problem-focused: expose a costly, specific operational pain the ICP lives with daily',
  'transformation-focused: show a before/after contrast with a concrete outcome metric',
  'insight-focused: share a counterintuitive industry data point that reframes the problem',
  'case-study: walk through ONE anonymized scenario start to finish — the state before (vivid and specific), the tension that made it unsustainable, what changed, the outcome. A scene with stakes, not a generic "imagine a company" — never name a real client, never invent a number that reads as a verified case-study metric, keep figures illustrative or omit them',
  'myth-busting: name a belief the ICP genuinely holds and take a real position against it — not a strawman nobody actually believes. The disagreement should be real enough that some readers push back in the comments',
  'cost-of-inaction: quantify what doing nothing costs — time, money, reputation',
  'trend-focused: connect the product to a macro shift happening in the industry right now',
  'question-led: open with a question the ICP has asked themselves but never resolved',
  'social-proof-focused: describe the kind of outcomes peers in their industry are seeing',
];
function angleFor(dayIndex: number): string {
  return CONTENT_ANGLES[dayIndex % CONTENT_ANGLES.length];
}

// Visual style rotation — deliberate visual break across the feed, and a
// variable to watch for which style holds attention best. One style per
// post, applied consistently to every image the post uses (single image,
// or all 8 carousel slide backgrounds).
function styleFor(postSeq: number): ImageStyle {
  return IMAGE_STYLES[postSeq % IMAGE_STYLES.length];
}

// ── Persona stream (2026-07-18) ──────────────────────────────────────────────
// One first-person post per day on Amit's own LinkedIn profile (channel=
// 'member', day_seq=4, fixed 08:30 slot). Company page = what In-Sync knows;
// Amit's feed = what Amit thinks. Never selling. Backstory, pillars, and the
// generator live in _shared/personaVoice.ts (shared with mkt-arohan-chat's
// "Persona Post Idea" flow) — single source of truth, don't duplicate here.

async function generateBlogPost(
  product: { product_name: string; product_url: string },
  icp: Record<string, unknown> | null,
  dayIndex: number,
): Promise<BlogDraft> {
  const industries = Array.isArray(icp?.industries) ? (icp.industries as string[]).slice(0, 3).join(', ') : 'B2B';
  const designations = Array.isArray(icp?.designations) ? (icp.designations as string[]).slice(0, 3).join(', ') : 'decision makers';
  const painPoints = Array.isArray(icp?.pain_points) ? (icp.pain_points as string[]).slice(0, 3).join('; ') : '';
  const ahaEvent = typeof icp?.aha_event === 'string' ? icp.aha_event : '';

  const angleHint = angleFor(dayIndex);
  const themeHint = themeFor(dayIndex);
  const research = await researchThemeFact(themeHint, industries, designations);

  const prompt = `You are Arohan, the autonomous marketing AI for In-Sync, a B2B SaaS platform company.

${BRAND_STORY}

THEME FOR TODAY (the story pillar this post must serve): ${themeHint}
ANGLE FOR TODAY (the rhetorical approach): ${angleHint}
EXAMPLE PRODUCT (proof point only): ${product.product_name}
AUDIENCE: ${designations} in ${industries}
THEIR PAIN POINTS: ${painPoints}
${ahaEvent ? `AHA MOMENT: ${ahaEvent}` : ''}
${buildStoryContext(themeHint)}

${researchBlock(research)}

Write a high-engagement LinkedIn thought leadership post promoting the In-Sync BRAND and platform story — NOT a pitch for any single product.

PRIMARY OBJECTIVE (2026-07-24, revised — engagement is now co-equal, not secondary): make the reader recognise the cost of running their business on disconnected tools AND actually stop scrolling to react — comment, share, or argue. A post nobody comments on doesn't get distributed by LinkedIn's own algorithm and doesn't build the brand either, so a technically-accurate post that reads as safe corporate thought-leadership has failed regardless of how well-sourced it is. Risk something in every post: a real position, a specific admission, a claim some readers will want to push back on. If a draft could have been posted by any competitor about any platform, it has failed.

CONTENT STANDARDS:
1. ${themeHint.startsWith('build story') ? 'This is a build-story post — anchor it on the REAL FACTS above, told as a specific chapter with real stakes, not a vague "we scaled" gesture. TODAY\'S RESEARCH FINDING (if present) is optional supporting color, not the main anchor.' : `Anchor the post on TODAY'S RESEARCH FINDING above — that is a real, just-verified fact, not something to second-guess or replace. Cite the source inline naturally (e.g. "According to a 2024 NASSCOM report..."). Do NOT fabricate additional numbers beyond it.`} ${NUMERIC_CLAIMS_RULE}
2. Write specifically for ${designations} in ${industries} — use their exact vocabulary, their operational context, their real daily frustrations. Avoid generic B2B language.
3. ${themeHint.startsWith('build story') ? `THE PLATFORM IS STILL THE HERO — this is the story of how In-Sync (the platform) came to exist, not a pitch for ${product.product_name} specifically. Only mention ${product.product_name} if it genuinely belongs in this chapter of the story; do not force it in.` : `THE PLATFORM IS THE HERO. Do not position ${product.product_name} as a standalone offering. Where the argument needs a concrete example, use ${product.product_name} in ONE paragraph as a proof point of what "one backbone" looks like in practice — then return to the platform story.`}

STRUCTURE:

HOOK (3-4 lines, ≤220 chars total):
Stop the scroll. If TODAY'S LIVE TREND above is a genuinely current item, open with it as a live observation — that is what separates "someone paying attention this week" from "a scheduled post." Otherwise open with the verified statistic, a counterintuitive truth, or a direct challenge to a common assumption. Must name a specific pain the audience recognises immediately, framed through today's theme.

BODY (8-12 paragraphs, ≤1900 chars total):
- Each paragraph: 1-3 lines, one idea, no bullet points
- Build the argument through today's theme: the cost of fragmentation → why adding more disconnected tools fails → what running on one platform changes
- Include at least 2 real data points with source attribution
- One paragraph uses ${product.product_name} as the concrete proof point (see standard 3)
- Final paragraph: a question that costs the reader something to answer honestly — it should pull out their own number, their own disagreement, or a story from their own operation, not a comfortable "what do you think" anyone could nod at and scroll past

CTA LINE (1 line):
Natural, non-pushy. Directs to the In-Sync platform without including the actual URL in the post body (LinkedIn deprioritises posts with external links). Example: "This is exactly why we built In-Sync as one platform — link in comments."

HASHTAGS (4-5, one line):
Industry-specific + product-specific mix.

FORMAT RULES:
- Total post: 2400-2800 characters (count carefully before returning)
- No markdown (no **, no ##, no leading dashes)
- Blank line between each paragraph
- Divider "───────────────" between HOOK and BODY, and between CTA and HASHTAGS
- Inside the post text, use single quotes (') for quoted phrases — never double quotes, which break the JSON response

image_keywords: 4 specific visual search terms that would find a compelling, professional B2B image for this post — think workplace scenarios, industry contexts, technology concepts. Avoid generic terms like "business" or "office".

strategy_note: 2-3 sentences for a human reviewer (not part of the post itself) explaining WHY this post was built this way — name the angle you used and why it fits today, and name the specific data point(s)/source(s) you anchored it on and why they're credible for this audience.

Return JSON only:
{
  "title": "internal tracking title for this post, max 120 chars",
  "teaser": "the hook section only (first 3-4 lines)",
  "full_post": "complete post: hook + divider + body + cta_line + divider + hashtags, ≤2800 chars",
  "image_keywords": ["keyword1", "keyword2", "keyword3", "keyword4"],
  "strategy_note": "explanation as described above",
  ${SOURCE_JSON_FIELD}
}`;

  const { data } = await callLLMJson<BlogDraft>(prompt, {
    model: 'sonnet',
    max_tokens: 2000,
    temperature: 0.8,
  });

  return data;
}

// ── Short-form content (image / video posts) ───────────────────────────────────

interface ShortCaption {
  title: string;         // internal tracking title
  caption: string;       // full LinkedIn post text, ≤600 chars
  image_keywords: string[];
  strategy_note: string; // 2-3 sentences: why this angle, what data/logic anchors it
  sources?: SourceRef[]; // links to the reports/surveys quoted in the caption
}

async function generateShortCaption(
  product: { product_name: string; product_url: string },
  icp: Record<string, unknown> | null,
  dayIndex: number,
  mediaKind: 'image' | 'video',
): Promise<ShortCaption> {
  const industries = Array.isArray(icp?.industries) ? (icp.industries as string[]).slice(0, 3).join(', ') : 'B2B';
  const designations = Array.isArray(icp?.designations) ? (icp.designations as string[]).slice(0, 3).join(', ') : 'decision makers';
  const painPoints = Array.isArray(icp?.pain_points) ? (icp.pain_points as string[]).slice(0, 3).join('; ') : '';
  const angleHint = angleFor(dayIndex);
  const themeHint = themeFor(dayIndex);
  const research = await researchThemeFact(themeHint, industries, designations);

  const prompt = `You are Arohan, the autonomous marketing AI for In-Sync, a B2B SaaS platform company.

${BRAND_STORY}

THEME FOR TODAY (the story pillar this post must serve): ${themeHint}
ANGLE FOR TODAY (the rhetorical approach): ${angleHint}
EXAMPLE PRODUCT (proof point only, optional in this short form): ${product.product_name}
AUDIENCE: ${designations} in ${industries}
THEIR PAIN POINTS: ${painPoints}
${buildStoryContext(themeHint)}
${researchBlock(research)}

Write a SHORT LinkedIn caption to accompany a ${mediaKind === 'video' ? 'short vertical video' : 'photo'} post promoting the In-Sync BRAND — the one-platform story — NOT a pitch for any single product. The visual carries the message; this caption should NOT try to be a full essay.

RULES:
- 2-4 short lines, 250-450 characters total
- Open with a hook line built on today's theme, one supporting line, then a soft CTA line toward In-Sync (no raw URL — say something like "link in comments")
- End with 3-4 relevant hashtags on their own line (brand/theme hashtags, not product ones)
- No markdown, no bullet points
- The platform is the hero; mention ${product.product_name} only if it fits naturally as a quick example
- If you quote a statistic, use TODAY'S RESEARCH FINDING above, named inline (e.g. "per a 2024 NASSCOM study"). ${NUMERIC_CLAIMS_RULE}

image_keywords: 4 specific visual search terms for a compelling B2B photo that dramatises today's theme in an Indian business context (e.g. the chaos of disconnected tools, or a team aligned around one screen).

strategy_note: 1-2 sentences for a human reviewer (not part of the post itself) explaining WHY this caption was framed this way given today's theme, angle, and the pain point it targets.

Return JSON only:
{
  "title": "internal tracking title, max 120 chars",
  "caption": "the full short caption as described above",
  "image_keywords": ["keyword1", "keyword2", "keyword3", "keyword4"],
  "strategy_note": "explanation as described above",
  ${SOURCE_JSON_FIELD}
}`;

  const { data } = await callLLMJson<ShortCaption>(prompt, {
    model: 'sonnet',
    max_tokens: 600,
    temperature: 0.8,
  });

  return data;
}

// ── Product showcase (2026-07-28) ───────────────────────────────────────────
// Every other format treats the product as a one-line proof point inside a
// brand-story narrative. This is the one slot per cycle that does the
// opposite: names ONE real, specific, concrete feature — pulled from the
// product's own notes when available — against the REAL screenshot of that
// product's live site (see productScreenshotUrl), instead of another
// AI-generated stock photo. The point is to show something true and
// checkable, not to make another argument.

interface ProductShowcaseCaption {
  title: string;
  caption: string;
  strategy_note: string;
  sources?: SourceRef[];
}

async function generateProductShowcase(
  product: { product_name: string; product_url: string; product_notes?: string | null; aha_event?: string | null },
  icp: Record<string, unknown> | null,
  dayIndex: number,
): Promise<ProductShowcaseCaption> {
  const industries = Array.isArray(icp?.industries) ? (icp.industries as string[]).slice(0, 3).join(', ') : 'B2B';
  const designations = Array.isArray(icp?.designations) ? (icp.designations as string[]).slice(0, 3).join(', ') : 'decision makers';
  const painPoints = Array.isArray(icp?.pain_points) ? (icp.pain_points as string[]).slice(0, 3).join('; ') : '';
  const hasNotes = typeof product.product_notes === 'string' && product.product_notes.trim().length > 0;

  const prompt = `You are Arohan, the autonomous marketing AI for In-Sync, a B2B SaaS platform company.

${BRAND_STORY}

AUDIENCE: ${designations} in ${industries}
THEIR PAIN POINTS: ${painPoints}
${product.aha_event ? `AHA MOMENT: ${product.aha_event}` : ''}

${hasNotes ? `REAL FEATURE NOTES for ${product.product_name} (use these — do not invent capabilities not listed here):\n${product.product_notes}` : `No detailed feature notes are on file for ${product.product_name} yet — write generally about what the screenshot shows (a real screen from ${product.product_url}) without inventing specific feature names or numbers that aren't visible in it.`}

This post is different from your usual brand-story posts: it is a PRODUCT SHOWCASE. The image is a REAL, live screenshot of ${product.product_name}'s own site — not an AI-generated photo. Your job is to write the caption that goes with it.

RULES:
- Name ONE specific, concrete feature or capability — the more literal and checkable, the better (e.g. "AI resume parsing that fills the candidate profile from a dropped PDF" beats "powerful AI features").
${hasNotes ? '- If the notes above include a real, specific number (time saved, % improvement, count), use it — that is the whole point of this format: real, not vague.' : ''}
- Write as an honest, specific claim a competitor could not casually copy-paste, not generic praise ("game-changing", "revolutionary", "seamless").
- 2-4 short lines, 250-450 characters total.
- End with 3-4 relevant hashtags on their own line (include one naming ${product.product_name} directly).
- No markdown, no bullet points, no raw URL (say "link in comments" if you need a CTA).

strategy_note: 1-2 sentences for a human reviewer explaining which specific feature/claim you picked and why it fits this audience.

Return JSON only:
{
  "title": "internal tracking title, max 120 chars",
  "caption": "the full caption as described above",
  "strategy_note": "explanation as described above",
  ${SOURCE_JSON_FIELD}
}`;

  const { data } = await callLLMJson<ProductShowcaseCaption>(prompt, {
    model: 'sonnet',
    max_tokens: 600,
    temperature: 0.7,
  });

  return data;
}

// ── Carousel content (8-slide swipe deck) ──────────────────────────────────────

interface CarouselContent {
  title: string;
  caption: string;         // short LinkedIn intro text accompanying the carousel
  slides: string[];        // exactly CAROUSEL_SLIDE_COUNT short slide lines
  image_keywords: string[];
  slide_scenes: string[];  // one short visual scene per slide — each slide gets its OWN background image
  strategy_note: string;   // 2-3 sentences: why this angle, what data/logic anchors it
  sources?: SourceRef[];   // links to the reports/surveys quoted on the slides
}

async function generateCarouselContent(
  product: { product_name: string; product_url: string },
  icp: Record<string, unknown> | null,
  dayIndex: number,
): Promise<CarouselContent> {
  const industries = Array.isArray(icp?.industries) ? (icp.industries as string[]).slice(0, 3).join(', ') : 'B2B';
  const designations = Array.isArray(icp?.designations) ? (icp.designations as string[]).slice(0, 3).join(', ') : 'decision makers';
  const painPoints = Array.isArray(icp?.pain_points) ? (icp.pain_points as string[]).slice(0, 3).join('; ') : '';
  const angleHint = angleFor(dayIndex);
  const themeHint = themeFor(dayIndex);
  const research = await researchThemeFact(themeHint, industries, designations);

  const prompt = `You are Arohan, the autonomous marketing AI for In-Sync, a B2B SaaS platform company.

${BRAND_STORY}

THEME FOR TODAY (the story pillar this deck must serve): ${themeHint}
ANGLE FOR TODAY (the rhetorical approach): ${angleHint}
EXAMPLE PRODUCT (proof point only): ${product.product_name}
AUDIENCE: ${designations} in ${industries}
THEIR PAIN POINTS: ${painPoints}
${buildStoryContext(themeHint)}
${researchBlock(research)}

Write an ${CAROUSEL_SLIDE_COUNT}-slide LinkedIn carousel (swipeable slide deck) promoting the In-Sync BRAND — the one-platform story — NOT a pitch for any single product.

STRUCTURE (exactly ${CAROUSEL_SLIDE_COUNT} slides):
- Slide 1: hook — a bold statement or question built on today's theme that stops the scroll
- Slides 2-7: one idea per slide, building the argument (a stat, the cost of fragmentation, a contrast, what one backbone changes, an outcome) — In-Sync the platform appears by slide 5 or 6 as the resolution, with ${product.product_name} usable as a one-slide concrete example
- Slide 8: direct CTA — invite the reader to comment or check the link in comments
- Build the deck around today's theme; never position any product as a standalone offering

RULES PER SLIDE:
- Max 100 characters per slide — these render as large title text on a slide image, not paragraphs
- No slide numbers, no markdown
- Punchy, declarative, one idea only
- A slide quoting a survey/report stat must name the source briefly at the end (e.g. "— Gartner, 2025"), within the 100-character limit. ${NUMERIC_CLAIMS_RULE}

caption: a short LinkedIn intro (150-300 characters) that accompanies the carousel post — a hook line plus 3-4 hashtags (brand/theme hashtags, not product ones), no need to repeat the slide content.

image_keywords: 4 visual search terms for the background imagery style of this carousel (professional B2B, dramatising today's theme in an Indian business context).

slide_scenes: exactly ${CAROUSEL_SLIDE_COUNT} entries, one per slide — a 3-6 word visual scene matching that slide's idea (e.g. "cluttered desk, many sticky notes", "team aligned around one dashboard"). Each slide gets its own background photo, so vary the scenes for visual rhythm while staying in one coherent visual family (same office world, same mood). Scenes must be purely visual descriptions of a single moment — never comparison words like "before/after" or "vs" (they trigger split layouts and text captions in the generated photo).

strategy_note: 2-3 sentences for a human reviewer (not part of the post itself) explaining WHY this carousel was built this way — the angle used, and what data point/logic anchors the argument.

Return JSON only:
{
  "title": "internal tracking title, max 120 chars",
  "caption": "short intro text as described above",
  "slides": ["slide 1 text", "slide 2 text", "...exactly ${CAROUSEL_SLIDE_COUNT} entries..."],
  "image_keywords": ["keyword1", "keyword2", "keyword3", "keyword4"],
  "slide_scenes": ["scene for slide 1", "...exactly ${CAROUSEL_SLIDE_COUNT} entries..."],
  "strategy_note": "explanation as described above",
  ${SOURCE_JSON_FIELD}
}`;

  const { data } = await callLLMJson<CarouselContent>(prompt, {
    model: 'sonnet',
    max_tokens: 1200,
    temperature: 0.8,
  });

  return data;
}

// ── Response helpers ──────────────────────────────────────────────────────────

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

// ── Main handler ──────────────────────────────────────────────────────────────

// Edge functions are killed after 150s of no response bytes, and this
// function writes nothing until its single insert at the very end — so a
// slow Shotstack render (its own poll loop can take up to 120s) stacked on
// top of image generation and the research web-search call can blow the
// whole budget and lose the draft entirely, with nothing to show for it.
// SHOTSTACK_DEADLINE_MS is checked right before that render starts; past it,
// skip straight to the fast Pexels video fallback instead of gambling the
// rest of the budget on a render that may not finish in time.
const SHOTSTACK_DEADLINE_MS = 60_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    let forceProductKey: string | null = null;
    let forceFormat: PostFormat | null = null;
    let forceMode = false;
    try {
      const body = await req.json().catch(() => ({}));
      forceMode = body?.force === true;
      forceProductKey = body?.product_key ?? null;
      forceFormat = (body?.format as PostFormat) ?? null;
    } catch { /* no body */ }

    // 1. Load active config
    const { data: config, error: configErr } = await supabase
      .from('mkt_linkedin_config')
      .select('*')
      .eq('active', true)
      .maybeSingle();

    if (configErr) return err(500, `Config load error: ${configErr.message}`);
    if (!config) return ok({ skip: 'no active linkedin config' });

    // 2. Load products (needed for rotation before picking the gap)
    const { data: products, error: prodErr } = await supabase
      .from('mkt_products')
      .select('product_key, product_name, product_url, product_notes, aha_event')
      .eq('org_id', config.org_id)
      .eq('active', true)
      .order('product_key');

    if (prodErr) return err(500, `Products load error: ${prodErr.message}`);
    if (!products?.length) return ok({ skip: 'no active products' });

    // 3. Pick the target: force mode writes an extra post for TODAY; normal
    // mode finds the oldest unfilled (date, day_seq) gap in the 7-day buffer
    // and writes exactly one draft per invocation.
    let targetDate: string;
    let daySeq: number | null = null;
    let gapsRemaining = 0;

    if (forceMode) {
      targetDate = getIST(0).date;
    } else {
      const bufferDates = Array.from({ length: BUFFER_DAYS }, (_, i) => getIST(i + 1).date);
      const { data: existing, error: existErr } = await supabase
        .from('blog_posts')
        .select('publish_date, day_seq')
        .eq('org_id', config.org_id)
        .gte('publish_date', bufferDates[0])
        .lte('publish_date', bufferDates[BUFFER_DAYS - 1])
        .not('day_seq', 'is', null);

      if (existErr) return err(500, `Buffer scan error: ${existErr.message}`);
      const filled = new Set((existing || []).map((r) => `${r.publish_date}#${r.day_seq}`));

      const gaps: Array<{ date: string; seq: number }> = [];
      for (const date of bufferDates) {
        for (let j = 0; j < POSTS_PER_DAY; j++) {
          if (!filled.has(`${date}#${j}`)) gaps.push({ date, seq: j });
        }
        // Persona post (Amit's profile) — weekdays only, 5/week (2026-07-24:
        // dropped from a daily streak per Arohan's recommendation).
        const dow = istDayOfWeek(date);
        const isWeekday = dow !== 0 && dow !== 6;
        if (isWeekday && !filled.has(`${date}#${PERSONA_DAY_SEQ}`)) gaps.push({ date, seq: PERSONA_DAY_SEQ });
      }
      if (!gaps.length) {
        return ok({ skip: 'buffer full', buffer_days: BUFFER_DAYS, posts_per_day: POSTS_PER_DAY });
      }
      targetDate = gaps[0].date;
      daySeq = gaps[0].seq;
      gapsRemaining = gaps.length - 1;
    }

    // 3b. Persona draft (channel='member') — text-only, no media, no product
    // rotation; grounded exclusively in the approved backstory facts.
    if (daySeq === PERSONA_DAY_SEQ) {
      const personaDayIndex = daysSince(config.start_date, targetDate);

      // Weekly anchor post lands on Wednesday — one reliable reference-post
      // slot a week (2026-07-24, Arohan recommendation), regardless of where
      // the 5-way pillar rotation happens to be that day.
      const isAnchorDay = istDayOfWeek(targetDate) === 3;
      // Poll lands every OTHER Friday (2026-07-24: "conduct a poll
      // sometimes") — distinct weekday from the anchor, so they never clash.
      const isPollDay = istDayOfWeek(targetDate) === 5 && Math.floor(personaDayIndex / 7) % 2 === 0;

      if (isPollDay) {
        const { data: recentPolls } = await supabase
          .from('blog_posts')
          .select('poll_question')
          .eq('org_id', config.org_id)
          .eq('channel', 'member')
          .not('poll_question', 'is', null)
          .order('publish_date', { ascending: false })
          .limit(10);
        const recentQuestions = (recentPolls || []).map((r) => r.poll_question as string).filter(Boolean);
        const poll = await generatePoll(PERSONA_BACKSTORY, 'a question Amit would genuinely be curious how his network answers, drawn from the scaling/operations/AI-building world he lives in', recentQuestions);

        const { error: pollInsertErr } = await supabase.from('blog_posts').insert({
          org_id: config.org_id,
          channel: 'member',
          blog_url: `draft://member/${targetDate}/persona-poll`,
          product_key: null,
          publish_date: targetDate,
          day_seq: PERSONA_DAY_SEQ,
          status: 'pending',
          social_posted: false,
          posted_timestamp: new Date().toISOString(),
          linkedin_slot_index: PERSONA_SLOT_INDEX,
          linkedin_cycle: Math.floor(personaDayIndex / SLOT_COUNT) + 1,
          post_format: 'poll',
          content_angle: 'persona: poll, never selling',
          content_theme: 'poll',
          blog_title: poll.title,
          blog_excerpt: poll.question,
          linkedin_draft_text: poll.question,
          poll_question: poll.question,
          poll_options: poll.options,
          poll_duration: poll.duration,
        });

        if (pollInsertErr) {
          if (pollInsertErr.code === '23505') {
            return ok({ skip: `persona gap ${targetDate} filled by concurrent run` });
          }
          return err(500, pollInsertErr.message);
        }

        console.log(`[blog-writer] persona poll saved for ${targetDate}, ${gapsRemaining} gaps left`);
        return ok({ success: true, channel: 'member', publish_date: targetDate, format: 'poll', gaps_remaining: gapsRemaining });
      }

      const { data: recent } = await supabase
        .from('blog_posts')
        .select('blog_title')
        .eq('org_id', config.org_id)
        .eq('channel', 'member')
        .order('publish_date', { ascending: false })
        .limit(14);
      const recentTitles = (recent || []).map((r) => r.blog_title as string).filter(Boolean);

      const draft = await generatePersonaPost(personaDayIndex, recentTitles, isAnchorDay);

      const { error: personaInsertErr } = await supabase.from('blog_posts').insert({
        org_id: config.org_id,
        channel: 'member',
        blog_url: `draft://member/${targetDate}/persona`,
        product_key: null,
        publish_date: targetDate,
        day_seq: PERSONA_DAY_SEQ,
        status: 'pending',
        social_posted: false,
        posted_timestamp: new Date().toISOString(),
        linkedin_slot_index: PERSONA_SLOT_INDEX,
        linkedin_cycle: Math.floor(personaDayIndex / SLOT_COUNT) + 1,
        post_format: 'text',
        content_angle: 'persona: first-person, story-led, never selling',
        content_theme: draft.pillar,
        blog_title: draft.title,
        blog_excerpt: draft.post_text.slice(0, 280),
        linkedin_draft_text: draft.post_text,
      });

      if (personaInsertErr) {
        if (personaInsertErr.code === '23505') {
          return ok({ skip: `persona gap ${targetDate} filled by concurrent run` });
        }
        return err(500, personaInsertErr.message);
      }

      console.log(`[blog-writer] persona draft saved for ${targetDate} (pillar: ${draft.pillar.split(':')[0]}), ${gapsRemaining} gaps left`);
      return ok({
        success: true,
        channel: 'member',
        publish_date: targetDate,
        pillar: draft.pillar.split(':')[0],
        gaps_remaining: gapsRemaining,
      });
    }

    // 4. Rotation is keyed on the global post sequence so product, format,
    // angle, and posting slot all vary WITHIN a day, not just across days.
    const daysForTarget = daysSince(config.start_date, targetDate);
    const postSeq = forceMode
      ? daysForTarget * POSTS_PER_DAY
      : daysForTarget * POSTS_PER_DAY + (daySeq as number);

    const product = forceProductKey
      ? (products.find((p) => p.product_key === forceProductKey) ?? products[postSeq % products.length])
      : products[postSeq % products.length];

    const slotIndex = postSeq % SLOT_COUNT;
    const cycle = Math.floor(postSeq / SLOT_COUNT) + 1;
    const postFormat: PostFormat = forceFormat ?? FORMAT_CYCLE[postSeq % FORMAT_CYCLE.length];

    // 5. Load latest ICP
    const { data: icp } = await supabase
      .from('mkt_product_icp')
      .select('industries, designations, pain_points, aha_event, company_sizes')
      .eq('product_key', product.product_key)
      .eq('org_id', config.org_id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const icpIndustries = Array.isArray(icp?.industries) ? (icp!.industries as string[]).slice(0, 3).join(', ') : 'B2B';
    const imageStyle = styleFor(postSeq);

    // Gemini AI image (primary) with Pexels stock as fallback.
    const r2Prefix = `ai/${targetDate}/${product.product_key}-${daySeq ?? 'force'}-${Date.now()}`;
    // Raw image (no watermark) — used as Shotstack's zoom/pan background,
    // where a corner-baked logo would drift out of frame as the zoom
    // progresses. The dedicated Shotstack overlay track handles video
    // branding instead (fixed position, immune to the zoom effect).
    async function getRawPostImage(keywords: string[], aspect: GeminiAspect, extra = ''): Promise<string | null> {
      const aiUrl = await generateGeminiImage(buildImagePrompt(keywords || [], icpIndustries, extra, imageStyle), aspect, r2Prefix);
      if (aiUrl) return aiUrl;
      console.warn('[blog-writer] Gemini image unavailable — falling back to Pexels');
      return await fetchPexelsImage(keywords || []).catch(() => null);
    }

    // Branded image — the In-Sync logo stamped on for brand recall. This is
    // what gets stored as the post's image_url and posted directly as a
    // standalone image (LinkedIn image posts, Instagram feed image).
    async function getPostImage(keywords: string[], aspect: GeminiAspect, extra = ''): Promise<string | null> {
      const rawUrl = await getRawPostImage(keywords, aspect, extra);
      if (!rawUrl) return null;
      return await brandImageUrl(rawUrl, `${r2Prefix}-branded`).catch((e) => {
        console.warn('[blog-writer] logo stamping failed, using unbranded image:', e instanceof Error ? e.message : e);
        return rawUrl;
      });
    }

    console.log(`[blog-writer] writing for ${targetDate} seq=${daySeq} product=${product.product_key} slot=${slotIndex} cycle=${cycle} format=${postFormat}`);

    const placeholderUrl = `draft://${LINKEDIN_ORG_ID}/${targetDate}/${product.product_key}/${daySeq ?? 'force'}`;
    const baseRow = {
      org_id: config.org_id,
      blog_url: placeholderUrl,
      product_key: product.product_key,
      publish_date: targetDate,
      day_seq: daySeq,
      status: 'pending',
      social_posted: false,
      posted_timestamp: new Date().toISOString(),
      linkedin_slot_index: slotIndex,
      linkedin_cycle: cycle,
      post_format: postFormat,
      content_angle: angleFor(postSeq),
      content_theme: themeFor(postSeq),
      content_icp_snapshot: icp || null,
      image_style: imageStyle,
    };

    let row: Record<string, unknown>;

    if (postFormat === 'text') {
      // 6a. Long-form text post — unchanged from the original design.
      const draft = await generateBlogPost(product, icp, postSeq);
      console.log(`[blog-writer] generating media for keywords: ${draft.image_keywords?.join(', ')}`);
      const rawImageUrl = await getRawPostImage(draft.image_keywords, '4:5');
      let videoUrl: string | null = null;
      if (rawImageUrl && Date.now() - startedAt < SHOTSTACK_DEADLINE_MS) {
        videoUrl = await generateShotstackVideo(rawImageUrl, draft.title).catch((e) => {
          console.warn('[blog-writer] Shotstack failed, falling back to Pexels video:', e.message);
          return null;
        });
      } else if (rawImageUrl) {
        console.warn('[blog-writer] skipping Shotstack — not enough time left before the 150s idle-timeout, using Pexels video instead');
      }
      if (!videoUrl) videoUrl = await fetchPexelsVideo(draft.image_keywords || []).catch(() => null);
      const imageUrl = rawImageUrl
        ? await brandImageUrl(rawImageUrl, `${r2Prefix}-branded`).catch(() => rawImageUrl)
        : null;
      const sourceLines = await verifiedSourceLines(draft.sources);

      row = {
        ...baseRow,
        blog_title: draft.title,
        blog_excerpt: draft.teaser,
        linkedin_draft_text: draft.full_post + sourceLines,
        image_url: imageUrl || null,
        video_url: videoUrl || null,
        content_strategy_note: draft.strategy_note || null,
      };

    } else if (postFormat === 'image') {
      // 6b. Image post — short caption + AI-generated editorial photo.
      const draft = await generateShortCaption(product, icp, postSeq, 'image');
      const imageUrl = await getPostImage(draft.image_keywords, '4:5');
      const sourceLines = await verifiedSourceLines(draft.sources);

      row = {
        ...baseRow,
        blog_title: draft.title,
        blog_excerpt: draft.caption + sourceLines,
        linkedin_short_caption: draft.caption + sourceLines,
        image_url: imageUrl || null,
        content_strategy_note: draft.strategy_note || null,
      };

    } else if (postFormat === 'product') {
      // 6b2. Product showcase (2026-07-28) — the one slot per cycle that shows
      // the real, live product screen (captured by
      // synthetic-monitor/capture-product-screenshots.mjs) and names one
      // specific, concrete feature — not another brand-story mention.
      const draft = await generateProductShowcase(product, icp, postSeq);
      const sourceLines = await verifiedSourceLines(draft.sources);

      row = {
        ...baseRow,
        blog_title: draft.title,
        blog_excerpt: draft.caption + sourceLines,
        linkedin_short_caption: draft.caption + sourceLines,
        image_url: productScreenshotUrl(product.product_key),
        content_strategy_note: draft.strategy_note || null,
      };

    } else if (postFormat === 'video') {
      // 6c. Video post — short caption; AI image becomes the video background.
      const draft = await generateShortCaption(product, icp, postSeq, 'video');
      const rawImageUrl = await getRawPostImage(draft.image_keywords, '9:16');
      let videoUrl: string | null = null;
      if (rawImageUrl && Date.now() - startedAt < SHOTSTACK_DEADLINE_MS) {
        videoUrl = await generateShotstackVideo(rawImageUrl, draft.title).catch((e) => {
          console.warn('[blog-writer] Shotstack failed, falling back to Pexels video:', e.message);
          return null;
        });
      } else if (rawImageUrl) {
        console.warn('[blog-writer] skipping Shotstack — not enough time left before the 150s idle-timeout, using Pexels video instead');
      }
      if (!videoUrl) videoUrl = await fetchPexelsVideo(draft.image_keywords || []).catch(() => null);
      const imageUrl = rawImageUrl
        ? await brandImageUrl(rawImageUrl, `${r2Prefix}-branded`).catch(() => rawImageUrl)
        : null;
      const sourceLines = await verifiedSourceLines(draft.sources);

      row = {
        ...baseRow,
        blog_title: draft.title,
        blog_excerpt: draft.caption + sourceLines,
        linkedin_short_caption: draft.caption + sourceLines,
        image_url: imageUrl || null,
        video_url: videoUrl || null,
        content_strategy_note: draft.strategy_note || null,
      };

    } else if (postFormat === 'poll') {
      // 6d. Native LinkedIn poll (2026-07-24) — no media, no fan-out to
      // FB/IG/X (no equivalent object there). Topic hint reuses the same
      // theme/angle rotation as everything else so polls still track the
      // week's story pillar instead of feeling disconnected.
      const { data: recentPolls } = await supabase
        .from('blog_posts')
        .select('poll_question')
        .eq('org_id', config.org_id)
        .eq('channel', 'company')
        .not('poll_question', 'is', null)
        .order('publish_date', { ascending: false })
        .limit(10);
      const recentQuestions = (recentPolls || []).map((r) => r.poll_question as string).filter(Boolean);
      const topicHint = `${themeFor(postSeq)} — audience: ${icp?.designations ?? 'B2B decision makers'} in ${icpIndustries}`;
      const poll = await generatePoll(BRAND_STORY, topicHint, recentQuestions);

      row = {
        ...baseRow,
        blog_title: poll.title,
        blog_excerpt: poll.question,
        linkedin_draft_text: poll.question,
        poll_question: poll.question,
        poll_options: poll.options,
        poll_duration: poll.duration,
      };

    } else {
      // 6e. Carousel — 8 short slides rendered as branded still images, each
      // over its OWN AI-generated background (visual break between slides —
      // user feedback 2026-07-15). The photo must read at full brightness: the
      // slide renderer only darkens the lower band where the text sits.
      const draft = await generateCarouselContent(product, icp, postSeq);
      const carouselExtra =
        'Bright, natural composition with a calm, uncluttered lower third — white display text will be overlaid near the bottom. The image must contain zero text, zero lettering, zero labels, and must be a single continuous scene (never a split/side-by-side comparison layout).';
      const scenes = Array.isArray(draft.slide_scenes) && draft.slide_scenes.length === draft.slides.length
        ? draft.slide_scenes
        : draft.slides.map(() => (draft.image_keywords || []).slice(0, 3).join(', '));

      // One background per slide, generated concurrently. A failed generation
      // falls back to the deck's first successful background (visual repeat
      // beats failing the whole deck), then to a Pexels photo.
      const bgUrls = await Promise.all(
        scenes.map((scene, i) =>
          generateGeminiImage(
            buildImagePrompt([scene, ...(draft.image_keywords || []).slice(0, 2)], icpIndustries, carouselExtra, imageStyle),
            '1:1',
            `${r2Prefix}-slide${i + 1}`,
          ),
        ),
      );
      const fallbackBg = bgUrls.find((u) => u) ||
        await fetchPexelsImage(draft.image_keywords || []).catch(() => null);

      let slideUrls: (string | null)[] = draft.slides.map(() => null);
      const slideErrors: (string | null)[] = draft.slides.map(() => null);
      if (fallbackBg) {
        console.log(`[blog-writer] rendering ${draft.slides.length} carousel slides (${bgUrls.filter(Boolean).length} unique backgrounds)`);
        slideUrls = await Promise.all(
          draft.slides.map(async (text, i) => {
            try {
              const jpgBytes = await renderSlideImage(bgUrls[i] || fallbackBg, text, i + 1, draft.slides.length);
              const key = `carousel/${targetDate}/${product.product_key}-${daySeq ?? 'force'}/slide-${i + 1}.jpg`;
              return await uploadToMarketingR2(key, jpgBytes, 'image/jpeg');
            } catch (e) {
              slideErrors[i] = e instanceof Error ? e.message : String(e);
              console.warn('[blog-writer] carousel slide render failed:', slideErrors[i]);
              return null;
            }
          }),
        );
      }

      if (slideUrls.some((u) => !u)) {
        return err(500, `Carousel slide rendering failed — ${JSON.stringify(slideErrors)}`);
      }

      const sourceLines = await verifiedSourceLines(draft.sources);

      row = {
        ...baseRow,
        blog_title: draft.title,
        blog_excerpt: draft.caption + sourceLines,
        linkedin_short_caption: draft.caption + sourceLines,
        carousel_slide_texts: draft.slides,
        carousel_slide_urls: slideUrls,
        image_url: slideUrls[0] || null,
        content_strategy_note: draft.strategy_note || null,
      };
    }

    // 7. Save draft
    const { error: insertErr } = await supabase.from('blog_posts').insert(row);

    if (insertErr) {
      // 23505 = another writer run filled this gap concurrently — not a failure.
      if (insertErr.code === '23505') {
        return ok({ skip: `gap ${targetDate}#${daySeq} filled by concurrent run` });
      }
      console.error(`[blog-writer] insert error:`, insertErr.message);
      return err(500, insertErr.message);
    }

    console.log(`[blog-writer] draft saved for ${targetDate}#${daySeq} (${postFormat}), ${gapsRemaining} gaps left`);
    return ok({
      success: true,
      product: product.product_key,
      publish_date: targetDate,
      day_seq: daySeq,
      slot_index: slotIndex,
      cycle,
      format: postFormat,
      gaps_remaining: gapsRemaining,
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[blog-writer] fatal:', msg);
    return err(500, msg);
  }
});
