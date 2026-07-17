/**
 * mkt-blog-writer — Arohan's content generation step.
 *
 * Maintains a PREWRITTEN BUFFER: 4 posts per day for every day in the next
 * 7 days (28 drafts), so a human can review and intervene well before
 * anything goes live. Runs every 30 minutes (cron: star-slash-30 UTC) and tops the
 * buffer up by ONE draft per invocation (media generation is heavy — a video
 * draft can take ~2 minutes), oldest gap first. When the buffer is full it
 * exits immediately.
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

const LINKEDIN_ORG_ID = Deno.env.get('LINKEDIN_ORG_ID') || '35932282';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30

const POSTS_PER_DAY = 4;   // minimum postings per day (user requirement)
const BUFFER_DAYS = 7;     // content prewritten at least a week ahead
const SLOT_COUNT = 9;      // mkt_linkedin_config.experiment_slots length

// Format rotation — 1 text : 2 image : 3 carousel : 2 video across 8 days.
// Every night's post used to be a single long text block; this spreads the
// existing nightly image/video generation across LinkedIn post types instead
// of letting it go unused (only Instagram/YouTube ever saw it).
const FORMAT_CYCLE = ['text', 'image', 'carousel', 'video', 'image', 'carousel', 'video', 'carousel'] as const;
type PostFormat = typeof FORMAT_CYCLE[number];
const CAROUSEL_SLIDE_COUNT = 8;

// ── Time helpers ──────────────────────────────────────────────────────────────

function getIST(offsetDays = 0) {
  const ms = Date.now() + IST_OFFSET_MS + offsetDays * 86_400_000;
  const d = new Date(ms);
  return { date: d.toISOString().slice(0, 10) };
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

// ── Brand-led strategy (2026-07-15) ─────────────────────────────────────────
// Every post promotes the In-Sync PLATFORM story; individual products appear
// only as proof points inside the narrative, never as standalone offerings.
// Narrative and proof points are lifted from the website home page — keep in
// sync with in-sync.co.in if the positioning there changes.
const BRAND_STORY = `BRAND: In-Sync (in-sync.co.in) — "Run your entire business on one platform."
CORE NARRATIVE: Growing Indian businesses run on spreadsheets, WhatsApp groups, and ten disconnected tools. Every gap between those tools leaks money, time, customers, and reputation. In-Sync replaces them with focused apps that share one backbone — your contacts, your channels, your data.
PROOF POINTS:
- One platform, ten products — start with the one that hurts most, the others plug straight in
- Built for India from day one: WhatsApp Business API, Aadhaar/PAN verification, Razorpay payments, Indian telephony built in, not bolted on
- AI where it earns its keep: AI calling agents, lead scoring, document analysis woven into the workflows, not sold as an add-on
- Live in days, not months: CSV imports, guided setup, per-user pricing that makes sense for growing teams
- Trusted across 8+ industries and 60+ cities in India`;

// The five brand story pillars. Rotates per post (like angle/format) so the
// week covers the whole story; stored on the row as content_theme for review.
const CONTENT_THEMES = [
  'operational efficiency: work should flow through one system instead of being retyped, forwarded, and chased across disconnected tools',
  'cost of fragmentation (loss): the silent leaks — enquiries that die in WhatsApp groups, payments that slip, hours burned reconciling tools that do not talk to each other',
  'brand image: slow replies, missed follow-ups, and inconsistent customer experience quietly teach customers the business is not reliable',
  'team alignment: everyone working from one truth — same contacts, same status, same priorities — instead of private spreadsheets and forgotten threads',
  'productivity: fewer tools, fewer tabs, fewer handoffs — people spend their day on customers, not on coordination',
];
function themeFor(postSeq: number): string {
  return CONTENT_THEMES[postSeq % CONTENT_THEMES.length];
}

// Rotating content angle, shared across every format so a reviewer can see the
// same "why" regardless of whether that day's post is text/image/video/carousel.
const CONTENT_ANGLES = [
  'problem-focused: expose a costly, specific operational pain the ICP lives with daily',
  'transformation-focused: show a before/after contrast with a concrete outcome metric',
  'insight-focused: share a counterintuitive industry data point that reframes the problem',
  'story-focused: walk through a real scenario (anonymised) the ICP will recognise',
  'myth-busting: challenge a common assumption the ICP holds about this problem',
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

  const prompt = `You are Arohan, the autonomous marketing AI for In-Sync, a B2B SaaS platform company.

${BRAND_STORY}

THEME FOR TODAY (the story pillar this post must serve): ${themeHint}
ANGLE FOR TODAY (the rhetorical approach): ${angleHint}
EXAMPLE PRODUCT (proof point only): ${product.product_name}
AUDIENCE: ${designations} in ${industries}
THEIR PAIN POINTS: ${painPoints}
${ahaEvent ? `AHA MOMENT: ${ahaEvent}` : ''}

Write a high-engagement LinkedIn thought leadership post promoting the In-Sync BRAND and platform story — NOT a pitch for any single product.

PRIMARY OBJECTIVE: Make the reader recognise the cost of running their business on disconnected tools, and want to see how one platform changes that. Drive them toward in-sync.co.in and a demo. Engagement (likes, comments) is secondary.

CONTENT STANDARDS:
1. Every factual claim must be based on verifiable, real-world data. Use actual statistics from published research, government reports, or well-known analysts (Gartner, McKinsey, NASSCOM, RBI, Forrester, etc.). Cite the source inline naturally (e.g. "According to a 2024 NASSCOM report..."). Do NOT fabricate numbers. ${NUMERIC_CLAIMS_RULE}
2. Write specifically for ${designations} in ${industries} — use their exact vocabulary, their operational context, their real daily frustrations. Avoid generic B2B language.
3. THE PLATFORM IS THE HERO. Do not position ${product.product_name} as a standalone offering. Where the argument needs a concrete example, use ${product.product_name} in ONE paragraph as a proof point of what "one backbone" looks like in practice — then return to the platform story.

STRUCTURE:

HOOK (3-4 lines, ≤220 chars total):
Stop the scroll. Open with a verified statistic, a counterintuitive truth, or a direct challenge to a common assumption. Must name a specific pain the audience recognises immediately, framed through today's theme.

BODY (8-12 paragraphs, ≤1900 chars total):
- Each paragraph: 1-3 lines, one idea, no bullet points
- Build the argument through today's theme: the cost of fragmentation → why adding more disconnected tools fails → what running on one platform changes
- Include at least 2 real data points with source attribution
- One paragraph uses ${product.product_name} as the concrete proof point (see standard 3)
- Final paragraph: a specific, direct question that makes the reader want to comment

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

  const prompt = `You are Arohan, the autonomous marketing AI for In-Sync, a B2B SaaS platform company.

${BRAND_STORY}

THEME FOR TODAY (the story pillar this post must serve): ${themeHint}
ANGLE FOR TODAY (the rhetorical approach): ${angleHint}
EXAMPLE PRODUCT (proof point only, optional in this short form): ${product.product_name}
AUDIENCE: ${designations} in ${industries}
THEIR PAIN POINTS: ${painPoints}

Write a SHORT LinkedIn caption to accompany a ${mediaKind === 'video' ? 'short vertical video' : 'photo'} post promoting the In-Sync BRAND — the one-platform story — NOT a pitch for any single product. The visual carries the message; this caption should NOT try to be a full essay.

RULES:
- 2-4 short lines, 250-450 characters total
- Open with a hook line built on today's theme, one supporting line, then a soft CTA line toward In-Sync (no raw URL — say something like "link in comments")
- End with 3-4 relevant hashtags on their own line (brand/theme hashtags, not product ones)
- No markdown, no bullet points
- The platform is the hero; mention ${product.product_name} only if it fits naturally as a quick example
- If you quote a statistic, it must come from a real published report/survey, named inline (e.g. "per a 2024 NASSCOM study"). ${NUMERIC_CLAIMS_RULE}

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

  const prompt = `You are Arohan, the autonomous marketing AI for In-Sync, a B2B SaaS platform company.

${BRAND_STORY}

THEME FOR TODAY (the story pillar this deck must serve): ${themeHint}
ANGLE FOR TODAY (the rhetorical approach): ${angleHint}
EXAMPLE PRODUCT (proof point only): ${product.product_name}
AUDIENCE: ${designations} in ${industries}
THEIR PAIN POINTS: ${painPoints}

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

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
      .select('product_key, product_name, product_url')
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
      }
      if (!gaps.length) {
        return ok({ skip: 'buffer full', buffer_days: BUFFER_DAYS, posts_per_day: POSTS_PER_DAY });
      }
      targetDate = gaps[0].date;
      daySeq = gaps[0].seq;
      gapsRemaining = gaps.length - 1;
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
      if (rawImageUrl) {
        videoUrl = await generateShotstackVideo(rawImageUrl, draft.title).catch((e) => {
          console.warn('[blog-writer] Shotstack failed, falling back to Pexels video:', e.message);
          return null;
        });
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

    } else if (postFormat === 'video') {
      // 6c. Video post — short caption; AI image becomes the video background.
      const draft = await generateShortCaption(product, icp, postSeq, 'video');
      const rawImageUrl = await getRawPostImage(draft.image_keywords, '9:16');
      let videoUrl: string | null = null;
      if (rawImageUrl) {
        videoUrl = await generateShotstackVideo(rawImageUrl, draft.title).catch((e) => {
          console.warn('[blog-writer] Shotstack failed, falling back to Pexels video:', e.message);
          return null;
        });
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

    } else {
      // 6d. Carousel — 8 short slides rendered as branded still images, each
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
