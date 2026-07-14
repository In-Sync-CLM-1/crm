/**
 * mkt-blog-poster — Arohan's LinkedIn publishing step.
 *
 * Called by 9 separate cron triggers (one per time slot). Each fires daily at its
 * designated IST time. Only one will match today's designated slot and post the
 * day's real draft.
 *
 * Flow:
 *  1. Load today's pending draft from blog_posts
 *  2. Check if current IST time matches today's designated slot (±20 min window)
 *  3. If yes → POST to LinkedIn → update blog_post to 'posted'
 *
 * The 9 slots are tested across 3 × 9-day cycles to find peak engagement time.
 * After 27 days the engagement tracker picks the winner and locks it in.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { uploadImageToLinkedIn, uploadVideoToLinkedIn, uploadDocumentToLinkedIn } from '../_shared/linkedinMedia.ts';
import { buildCarouselPdf } from '../_shared/carouselPdf.ts';

const LINKEDIN_VERSION = '202503';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// ── Time helpers ──────────────────────────────────────────────────────────────

function getIST() {
  const d = new Date(Date.now() + IST_OFFSET_MS);
  const hh = d.getUTCHours();
  const mm = d.getUTCMinutes();
  return {
    date: d.toISOString().slice(0, 10),
    hhmm: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
    totalMinutes: hh * 60 + mm,
  };
}

function slotMinutes(slot: string): number {
  const [h, m] = slot.split(':').map(Number);
  return h * 60 + m;
}

function daysSince(startDate: string, referenceDate: string): number {
  const start = new Date(startDate + 'T00:00:00Z').getTime();
  const ref = new Date(referenceDate + 'T00:00:00Z').getTime();
  return Math.max(0, Math.floor((ref - start) / 86_400_000));
}

// ── LinkedIn post ─────────────────────────────────────────────────────────────

interface LinkedInMedia {
  id: string;             // asset URN (image/video/document)
  title?: string;         // shown under the media for document (carousel) posts
}

async function postToLinkedIn(
  text: string,
  token: string,
  authorUrn: string,
  media?: LinkedInMedia,
): Promise<{ postUrn: string; postUrl: string }> {
  const res = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'LinkedIn-Version': LINKEDIN_VERSION,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: authorUrn,
      commentary: text,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
      ...(media ? { content: { media: { id: media.id, ...(media.title ? { title: media.title } : {}) } } } : {}),
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LinkedIn POST /rest/posts failed ${res.status}: ${errText}`);
  }

  // Try to read body before headers (some LinkedIn responses put id in body)
  let bodyData: Record<string, unknown> = {};
  try { bodyData = await res.json(); } catch { /* empty body */ }

  const postUrn =
    res.headers.get('x-restli-id') ||
    res.headers.get('x-linkedin-id') ||
    (bodyData.id as string) ||
    '';

  const postUrl = postUrn
    ? `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}/`
    : `https://www.linkedin.com/in/me/recent-activity/all/`;

  return { postUrn, postUrl };
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
    // 1. Load active config
    const { data: config, error: configErr } = await supabase
      .from('mkt_linkedin_config')
      .select('*')
      .eq('active', true)
      .maybeSingle();

    if (configErr) return err(500, `Config load error: ${configErr.message}`);
    if (!config) return ok({ skip: 'no active linkedin config' });
    if (!config.member_access_token || !config.member_urn) {
      return err(500, 'LinkedIn not connected — no member_access_token/member_urn on mkt_linkedin_config');
    }
    if (config.member_token_expires_at && new Date(config.member_token_expires_at) < new Date()) {
      return err(500, `LinkedIn token expired at ${config.member_token_expires_at} — reconnect via mkt-linkedin-oauth-callback`);
    }

    const ist = getIST();

    // Support force=true to bypass time window (manual trigger / missed slot recovery)
    let force = false;
    if (req.method === 'POST') {
      try {
        const body = await req.clone().json();
        force = !!body.force;
      } catch { /* no body */ }
    }

    // 2. Determine today's designated slot
    const days = daysSince(config.start_date, ist.date);
    const todaySlotIdx = days % 9;
    const slots = config.experiment_slots as string[];
    const targetSlot = (config.experiment_complete && config.winning_slot)
      ? config.winning_slot
      : slots[todaySlotIdx];

    // 3. Is it time? ±20 min window (skipped when force=true)
    if (!force) {
      const diff = Math.abs(ist.totalMinutes - slotMinutes(targetSlot));
      if (diff > 20) {
        return ok({ skip: `not time yet`, now_ist: ist.hhmm, target: targetSlot });
      }
    }

    // 4. Check we haven't already posted today
    if (config.last_posted_date === ist.date) {
      return ok({ skip: 'already posted today', date: ist.date });
    }

    // 5. Find today's pending draft (any format — text has linkedin_draft_text,
    // image/video/carousel have linkedin_short_caption instead)
    const { data: draft, error: draftErr } = await supabase
      .from('blog_posts')
      .select('id, blog_title, linkedin_draft_text, linkedin_short_caption, post_format, image_url, video_url, carousel_slide_urls, product_key, linkedin_slot_index, linkedin_cycle')
      .eq('org_id', config.org_id)
      .eq('publish_date', ist.date)
      .eq('status', 'pending')
      .or('linkedin_draft_text.not.is.null,linkedin_short_caption.not.is.null')
      .maybeSingle();

    if (draftErr) return err(500, `Draft load error: ${draftErr.message}`);
    if (!draft) return ok({ skip: `no pending draft for today (${ist.date})` });

    const format = (draft.post_format as string) || 'text';
    console.log(`[blog-poster] posting draft for ${ist.date} slot=${targetSlot} product=${draft.product_key} format=${format}`);

    // 6. Upload media (if any) and post to LinkedIn
    const commentary = format === 'text' ? draft.linkedin_draft_text : draft.linkedin_short_caption;
    let media: LinkedInMedia | undefined;

    if (format === 'image' && draft.image_url) {
      const id = await uploadImageToLinkedIn(config.member_access_token, config.member_urn, draft.image_url as string);
      media = { id };
    } else if (format === 'video' && draft.video_url) {
      const id = await uploadVideoToLinkedIn(config.member_access_token, config.member_urn, draft.video_url as string);
      media = { id };
    } else if (format === 'carousel' && Array.isArray(draft.carousel_slide_urls) && draft.carousel_slide_urls.length) {
      const pdfBytes = await buildCarouselPdf(draft.carousel_slide_urls as string[]);
      const id = await uploadDocumentToLinkedIn(config.member_access_token, config.member_urn, pdfBytes);
      media = { id, title: draft.blog_title as string };
    }

    const { postUrn, postUrl } = await postToLinkedIn(commentary, config.member_access_token, config.member_urn, media);
    console.log(`[blog-poster] posted: ${postUrn} (format=${format})`);

    // 7. Update blog_post — replace placeholder URL with real LinkedIn URL
    await supabase
      .from('blog_posts')
      .update({
        blog_url: postUrl,
        status: 'posted',
        social_posted: true,
        linkedin_url: postUrl,
        linkedin_post_urn: postUrn || null,
        posted_timestamp: new Date().toISOString(),
      })
      .eq('id', draft.id);

    // 8. Update config
    const experimentComplete = !config.experiment_complete && (days + 1) >= 27;
    await supabase
      .from('mkt_linkedin_config')
      .update({
        last_posted_date: ist.date,
        last_posted_slot_index: todaySlotIdx,
        last_posted_product_key: draft.product_key,
        ...(experimentComplete ? { experiment_complete: true } : {}),
      })
      .eq('id', config.id);

    // Fire Facebook, Instagram, and YouTube in parallel (don't block LinkedIn response)
    // Each function handles its own auth check and gracefully skips if not configured.
    const supaUrl = Deno.env.get('SUPABASE_URL');
    const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const socialBody = JSON.stringify({ blog_post_id: draft.id });
    const socialHeaders = {
      'Authorization': `Bearer ${svcKey}`,
      'Content-Type': 'application/json',
    };
    const [fbRes, igRes, ytRes] = await Promise.allSettled([
      fetch(`${supaUrl}/functions/v1/mkt-social-facebook`, { method: 'POST', headers: socialHeaders, body: socialBody, signal: AbortSignal.timeout(30_000) }),
      fetch(`${supaUrl}/functions/v1/mkt-social-instagram`, { method: 'POST', headers: socialHeaders, body: socialBody, signal: AbortSignal.timeout(90_000) }),
      fetch(`${supaUrl}/functions/v1/mkt-social-youtube`, { method: 'POST', headers: socialHeaders, body: socialBody, signal: AbortSignal.timeout(120_000) }),
    ]);

    const socialResult = {
      facebook: fbRes.status === 'fulfilled' ? await fbRes.value.json().catch(() => null) : { error: fbRes.reason?.message },
      instagram: igRes.status === 'fulfilled' ? await igRes.value.json().catch(() => null) : { error: igRes.reason?.message },
      youtube: ytRes.status === 'fulfilled' ? await ytRes.value.json().catch(() => null) : { error: ytRes.reason?.message },
    };

    return ok({
      success: true,
      product: draft.product_key,
      slot: targetSlot,
      slot_index: todaySlotIdx,
      post_urn: postUrn,
      post_url: postUrl,
      social: socialResult,
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[blog-poster] fatal:', msg);
    return err(500, msg);
  }
});
