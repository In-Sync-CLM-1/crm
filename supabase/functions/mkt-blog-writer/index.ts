/**
 * mkt-blog-writer — Arohan's LinkedIn content generation step.
 *
 * Runs nightly at 9:30 PM IST (cron: 0 16 * * * UTC).
 * Picks tomorrow's product, generates a full LinkedIn post via Claude Sonnet,
 * fetches a matching image + video from Pexels, and saves everything as a
 * DRAFT in blog_posts (status='pending').
 *
 * A separate function (mkt-blog-poster) picks up the draft and publishes it
 * to LinkedIn (+ Facebook, Instagram, YouTube) at the correct slot time.
 *
 * Can also be triggered manually by Arohan chat (force=true, product_key optional).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callLLMJson } from '../_shared/llmClient.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { renderSlideImage } from '../_shared/slideImage.ts';
import { uploadToMarketingR2 } from '../_shared/r2Marketing.ts';

const LINKEDIN_ORG_ID = Deno.env.get('LINKEDIN_ORG_ID') || '35932282';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30

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
        // Track 2 (top): Title text — fade in at 1.5s, hold, fade out
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

  const angles = [
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
  const angleHint = angles[dayIndex % angles.length];

  const prompt = `You are Arohan, the autonomous marketing AI for In-Sync, a B2B SaaS company.

PRODUCT: ${product.product_name}
PRODUCT URL: ${product.product_url}
ICP INDUSTRIES: ${industries}
ICP ROLES: ${designations}
PAIN POINTS: ${painPoints}
AHA MOMENT: ${ahaEvent}
ANGLE FOR TODAY: ${angleHint}

Write a high-engagement LinkedIn thought leadership post for the In-Sync company page.

PRIMARY OBJECTIVE: Drive the reader to visit ${product.product_url} and click the trial/demo button. Engagement (likes, comments) is secondary. The post succeeds only when it creates enough credibility and curiosity that the reader wants to see the product.

CONTENT STANDARDS:
1. Every factual claim must be based on verifiable, real-world data. Use actual statistics from published research, government reports, or well-known analysts (Gartner, McKinsey, NASSCOM, RBI, Forrester, etc.). Cite the source inline naturally (e.g. "According to a 2024 NASSCOM report..."). Do NOT fabricate numbers.
2. Write specifically for ${designations} in ${industries} — use their exact vocabulary, their operational context, their real daily frustrations. Avoid generic B2B language.
3. The product mention must feel earned, not forced. Introduce ${product.product_name} as the logical conclusion to the argument you've built.

STRUCTURE:

HOOK (3-4 lines, ≤220 chars total):
Stop the scroll. Open with a verified statistic, a counterintuitive truth, or a direct challenge to a common assumption. Must name a specific pain the ICP recognises immediately.

BODY (8-12 paragraphs, ≤1900 chars total):
- Each paragraph: 1-3 lines, one idea, no bullet points
- Build the argument: problem depth → why existing approaches fail → what the shift looks like
- Include at least 2 real data points with source attribution
- One paragraph naturally introduces ${product.product_name} as the mechanism for the shift
- Final paragraph: a specific, direct question that makes the reader want to comment

CTA LINE (1 line):
Natural, non-pushy. Directs to the product without including the actual URL in the post body (LinkedIn deprioritises posts with external links). Example: "We built ${product.product_name} for exactly this — link in comments."

HASHTAGS (4-5, one line):
Industry-specific + product-specific mix.

FORMAT RULES:
- Total post: 2400-2800 characters (count carefully before returning)
- No markdown (no **, no ##, no leading dashes)
- Blank line between each paragraph
- Divider "───────────────" between HOOK and BODY, and between CTA and HASHTAGS

image_keywords: 4 specific visual search terms that would find a compelling, professional B2B image for this post — think workplace scenarios, industry contexts, technology concepts. Avoid generic terms like "business" or "office".

Return JSON only:
{
  "title": "internal tracking title for this post, max 120 chars",
  "teaser": "the hook section only (first 3-4 lines)",
  "full_post": "complete post: hook + divider + body + cta_line + divider + hashtags, ≤2800 chars",
  "image_keywords": ["keyword1", "keyword2", "keyword3", "keyword4"]
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

  const prompt = `You are Arohan, the autonomous marketing AI for In-Sync, a B2B SaaS company.

PRODUCT: ${product.product_name}
ICP ROLES: ${designations} in ${industries}
PAIN POINTS: ${painPoints}

Write a SHORT LinkedIn caption to accompany a ${mediaKind === 'video' ? 'short vertical video' : 'photo'} post. The visual carries the message — this caption should NOT try to be a full essay.

RULES:
- 2-4 short lines, 250-450 characters total
- Open with a hook line, one supporting line, then a soft CTA line (no raw URL — say something like "link in comments")
- End with 3-4 relevant hashtags on their own line
- No markdown, no bullet points

image_keywords: 4 specific visual search terms for a compelling B2B photo relevant to ${product.product_name} and ${industries}.

Return JSON only:
{
  "title": "internal tracking title, max 120 chars",
  "caption": "the full short caption as described above",
  "image_keywords": ["keyword1", "keyword2", "keyword3", "keyword4"]
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
}

async function generateCarouselContent(
  product: { product_name: string; product_url: string },
  icp: Record<string, unknown> | null,
  dayIndex: number,
): Promise<CarouselContent> {
  const industries = Array.isArray(icp?.industries) ? (icp.industries as string[]).slice(0, 3).join(', ') : 'B2B';
  const designations = Array.isArray(icp?.designations) ? (icp.designations as string[]).slice(0, 3).join(', ') : 'decision makers';
  const painPoints = Array.isArray(icp?.pain_points) ? (icp.pain_points as string[]).slice(0, 3).join('; ') : '';

  const prompt = `You are Arohan, the autonomous marketing AI for In-Sync, a B2B SaaS company.

PRODUCT: ${product.product_name}
ICP ROLES: ${designations} in ${industries}
PAIN POINTS: ${painPoints}

Write an ${CAROUSEL_SLIDE_COUNT}-slide LinkedIn carousel (swipeable slide deck) for the In-Sync page.

STRUCTURE (exactly ${CAROUSEL_SLIDE_COUNT} slides):
- Slide 1: hook — a bold statement or question that stops the scroll
- Slides 2-7: one idea per slide, building the argument (a stat, a pain point, a contrast, a mechanism, an outcome) — ${product.product_name} should appear naturally by slide 5 or 6 as the resolution
- Slide 8: direct CTA — invite the reader to comment or check the link in comments

RULES PER SLIDE:
- Max 100 characters per slide — these render as large title text on a slide image, not paragraphs
- No slide numbers, no markdown
- Punchy, declarative, one idea only

caption: a short LinkedIn intro (150-300 characters) that accompanies the carousel post — a hook line plus 3-4 hashtags, no need to repeat the slide content.

image_keywords: 4 visual search terms for the background imagery style of this carousel (professional B2B, relevant to ${industries}).

Return JSON only:
{
  "title": "internal tracking title, max 120 chars",
  "caption": "short intro text as described above",
  "slides": ["slide 1 text", "slide 2 text", "...exactly ${CAROUSEL_SLIDE_COUNT} entries..."],
  "image_keywords": ["keyword1", "keyword2", "keyword3", "keyword4"]
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

    // 2. Draft is written for TOMORROW
    const tomorrowIST = getIST(1);
    const targetDate = forceMode ? getIST(0).date : tomorrowIST.date;

    // 3. Check if draft already exists
    if (!forceMode) {
      const { data: existingDraft } = await supabase
        .from('blog_posts')
        .select('id')
        .eq('org_id', config.org_id)
        .eq('publish_date', targetDate)
        .eq('status', 'pending')
        .maybeSingle();

      if (existingDraft) {
        return ok({ skip: `draft for ${targetDate} already written` });
      }
    }

    // 4. Pick product (round-robin)
    const { data: products, error: prodErr } = await supabase
      .from('mkt_products')
      .select('product_key, product_name, product_url')
      .eq('org_id', config.org_id)
      .eq('active', true)
      .order('product_key');

    if (prodErr) return err(500, `Products load error: ${prodErr.message}`);
    if (!products?.length) return ok({ skip: 'no active products' });

    const daysForTarget = daysSince(config.start_date, targetDate);
    const product = forceProductKey
      ? (products.find((p) => p.product_key === forceProductKey) ?? products[daysForTarget % products.length])
      : products[daysForTarget % products.length];

    const slotIndex = daysForTarget % 9;
    const cycle = Math.floor(daysForTarget / 9) + 1;
    const postFormat: PostFormat = forceFormat ?? FORMAT_CYCLE[daysForTarget % FORMAT_CYCLE.length];

    // 5. Load latest ICP
    const { data: icp } = await supabase
      .from('mkt_product_icp')
      .select('industries, designations, pain_points, aha_event, company_sizes')
      .eq('product_key', product.product_key)
      .eq('org_id', config.org_id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log(`[blog-writer] writing for ${targetDate} product=${product.product_key} slot=${slotIndex} cycle=${cycle} format=${postFormat}`);

    const placeholderUrl = `draft://${LINKEDIN_ORG_ID}/${targetDate}/${product.product_key}`;
    const baseRow = {
      org_id: config.org_id,
      blog_url: placeholderUrl,
      product_key: product.product_key,
      publish_date: targetDate,
      status: 'pending',
      social_posted: false,
      posted_timestamp: new Date().toISOString(),
      linkedin_slot_index: slotIndex,
      linkedin_cycle: cycle,
      post_format: postFormat,
    };

    let row: Record<string, unknown>;

    if (postFormat === 'text') {
      // 6a. Long-form text post — unchanged from the original design.
      const draft = await generateBlogPost(product, icp, daysForTarget);
      console.log(`[blog-writer] fetching media for keywords: ${draft.image_keywords?.join(', ')}`);
      const imageUrl = await fetchPexelsImage(draft.image_keywords || []).catch(() => null);
      let videoUrl: string | null = null;
      if (imageUrl) {
        videoUrl = await generateShotstackVideo(imageUrl, draft.title).catch((e) => {
          console.warn('[blog-writer] Shotstack failed, falling back to Pexels video:', e.message);
          return null;
        });
      }
      if (!videoUrl) videoUrl = await fetchPexelsVideo(draft.image_keywords || []).catch(() => null);

      row = {
        ...baseRow,
        blog_title: draft.title,
        blog_excerpt: draft.teaser,
        linkedin_draft_text: draft.full_post,
        image_url: imageUrl || null,
        video_url: videoUrl || null,
      };

    } else if (postFormat === 'image') {
      // 6b. Image post — short caption, reuse the nightly Pexels image.
      const draft = await generateShortCaption(product, icp, daysForTarget, 'image');
      const imageUrl = await fetchPexelsImage(draft.image_keywords || []).catch(() => null);

      row = {
        ...baseRow,
        blog_title: draft.title,
        blog_excerpt: draft.caption,
        linkedin_short_caption: draft.caption,
        image_url: imageUrl || null,
      };

    } else if (postFormat === 'video') {
      // 6c. Video post — short caption, reuse the nightly Shotstack video.
      const draft = await generateShortCaption(product, icp, daysForTarget, 'video');
      const imageUrl = await fetchPexelsImage(draft.image_keywords || []).catch(() => null);
      let videoUrl: string | null = null;
      if (imageUrl) {
        videoUrl = await generateShotstackVideo(imageUrl, draft.title).catch((e) => {
          console.warn('[blog-writer] Shotstack failed, falling back to Pexels video:', e.message);
          return null;
        });
      }
      if (!videoUrl) videoUrl = await fetchPexelsVideo(draft.image_keywords || []).catch(() => null);

      row = {
        ...baseRow,
        blog_title: draft.title,
        blog_excerpt: draft.caption,
        linkedin_short_caption: draft.caption,
        image_url: imageUrl || null,
        video_url: videoUrl || null,
      };

    } else {
      // 6d. Carousel — 8 short slides rendered as branded still images.
      const draft = await generateCarouselContent(product, icp, daysForTarget);
      const bgImageUrl = await fetchPexelsImage(draft.image_keywords || []).catch(() => null);

      let slideUrls: (string | null)[] = draft.slides.map(() => null);
      const slideErrors: (string | null)[] = draft.slides.map(() => null);
      if (bgImageUrl) {
        console.log(`[blog-writer] rendering ${draft.slides.length} carousel slides`);
        slideUrls = await Promise.all(
          draft.slides.map(async (text, i) => {
            try {
              const jpgBytes = await renderSlideImage(bgImageUrl, text);
              const key = `carousel/${targetDate}/${product.product_key}/slide-${i + 1}.jpg`;
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

      row = {
        ...baseRow,
        blog_title: draft.title,
        blog_excerpt: draft.caption,
        linkedin_short_caption: draft.caption,
        carousel_slide_texts: draft.slides,
        carousel_slide_urls: slideUrls,
        image_url: slideUrls[0] || null,
      };
    }

    // 7. Save draft
    const { error: insertErr } = await supabase.from('blog_posts').insert(row);

    if (insertErr) {
      console.error(`[blog-writer] insert error:`, insertErr.message);
      return err(500, insertErr.message);
    }

    console.log(`[blog-writer] draft saved for ${targetDate} (${postFormat})`);
    return ok({
      success: true,
      product: product.product_key,
      publish_date: targetDate,
      slot_index: slotIndex,
      cycle,
      format: postFormat,
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[blog-writer] fatal:', msg);
    return err(500, msg);
  }
});
