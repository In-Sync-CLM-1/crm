/**
 * mkt-blog-poster — Arohan's LinkedIn publishing step.
 *
 * Called by 9 separate cron triggers (one per time slot). Each fires daily at
 * its IST time. Every draft row carries its own linkedin_slot_index, and 4
 * posts go out per day (each at a different slot) — so each cron firing posts
 * whichever pending draft is assigned to the slot matching the current time.
 *
 * Flow:
 *  1. Load today's pending drafts from blog_posts
 *  2. Pick the one whose assigned slot matches the current IST time (±20 min)
 *  3. POST to LinkedIn → update that row to 'posted' → fan out FB/IG/YouTube
 *
 * force=true bypasses the time window and posts the earliest pending draft.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { uploadImageToLinkedIn, uploadVideoToLinkedIn, uploadDocumentToLinkedIn } from '../_shared/linkedinMedia.ts';
import { buildCarouselPdf } from '../_shared/carouselPdf.ts';
import { getLinkedInIdentity } from '../_shared/linkedinAuth.ts';

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

    // Prefer the company page (org token, auto-refreshing); fall back to the
    // member profile if the org connection isn't set up or is unusable.
    const identity = await getLinkedInIdentity(supabase, config);
    if (!identity) {
      return err(500, 'LinkedIn not connected — no usable org or member token on mkt_linkedin_config; reconnect via mkt-linkedin-oauth-callback');
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

    const slots = config.experiment_slots as string[];

    // 2. Load today's pending drafts (any format — text has linkedin_draft_text,
    // image/video/carousel have linkedin_short_caption instead). Multiple posts
    // go out per day, each row carrying its own slot.
    const { data: drafts, error: draftErr } = await supabase
      .from('blog_posts')
      .select('id, channel, blog_title, linkedin_draft_text, linkedin_short_caption, post_format, image_url, video_url, carousel_slide_urls, product_key, linkedin_slot_index, linkedin_cycle, day_seq')
      .eq('org_id', config.org_id)
      .eq('publish_date', ist.date)
      .eq('status', 'pending')
      .not('linkedin_slot_index', 'is', null)
      .or('linkedin_draft_text.not.is.null,linkedin_short_caption.not.is.null');

    if (draftErr) return err(500, `Draft load error: ${draftErr.message}`);
    if (!drafts?.length) return ok({ skip: `no pending drafts for today (${ist.date})` });

    // 3. Pick the drafts whose assigned slot matches NOW (±20 min). Company
    // slots are ≥60 min apart so at most one company draft matches — but the
    // persona draft (channel='member', fixed slot) can share a window with a
    // company draft, so this handles a list. force=true posts the earliest.
    const bySlotTime = [...drafts].sort((a, b) =>
      slotMinutes(slots[a.linkedin_slot_index % slots.length]) - slotMinutes(slots[b.linkedin_slot_index % slots.length]));

    const matches = force
      ? bySlotTime.slice(0, 1)
      : bySlotTime.filter((d) =>
          Math.abs(ist.totalMinutes - slotMinutes(slots[d.linkedin_slot_index % slots.length])) <= 20);

    if (!matches.length) {
      return ok({
        skip: 'no draft scheduled for this time',
        now_ist: ist.hhmm,
        pending_slots: bySlotTime.map((d) => slots[d.linkedin_slot_index % slots.length]),
      });
    }

    const results: Record<string, unknown>[] = [];

    for (const draft of matches) {
      const isPersona = draft.channel === 'member';
      const targetSlot = slots[draft.linkedin_slot_index % slots.length];
      const days = daysSince(config.start_date, ist.date);
      const todaySlotIdx = draft.linkedin_slot_index % slots.length;

      // Persona posts publish as Amit himself; company posts as the page.
      // Single-app mode: one token carries both w_organization_social and
      // w_member_social, so only the author URN changes.
      if (isPersona && !config.member_urn) {
        results.push({ id: draft.id, error: 'persona draft skipped — no member_urn on config' });
        continue;
      }
      const authorUrn = isPersona ? (config.member_urn as string) : identity.authorUrn;

      const format = (draft.post_format as string) || 'text';
      console.log(`[blog-poster] posting ${isPersona ? 'PERSONA' : 'company'} draft for ${ist.date} seq=${draft.day_seq} slot=${targetSlot} format=${format}`);

      // Upload media (if any) and post to LinkedIn
      const commentary = format === 'text' ? draft.linkedin_draft_text : draft.linkedin_short_caption;
      let media: LinkedInMedia | undefined;

      if (format === 'image' && draft.image_url) {
        const id = await uploadImageToLinkedIn(identity.token, authorUrn, draft.image_url as string);
        media = { id };
      } else if (format === 'video' && draft.video_url) {
        const id = await uploadVideoToLinkedIn(identity.token, authorUrn, draft.video_url as string);
        media = { id };
      } else if (format === 'carousel' && Array.isArray(draft.carousel_slide_urls) && draft.carousel_slide_urls.length) {
        const pdfBytes = await buildCarouselPdf(draft.carousel_slide_urls as string[]);
        const id = await uploadDocumentToLinkedIn(identity.token, authorUrn, pdfBytes);
        media = { id, title: draft.blog_title as string };
      }

      const { postUrn, postUrl } = await postToLinkedIn(commentary, identity.token, authorUrn, media);
      console.log(`[blog-poster] posted as ${isPersona ? 'member (persona)' : identity.isOrg ? 'company page' : 'member'}: ${postUrn} (format=${format})`);

      // Update blog_post — replace placeholder URL with real LinkedIn URL
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

      if (!isPersona) {
        // Update config (company stream bookkeeping only)
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
      }

      // Fan-out: company posts go to FB+IG+YouTube. Persona posts cross-post
      // ONLY to the Facebook Page (with founder attribution — no personal-
      // profile API exists on Meta); no Instagram/YouTube.
      const supaUrl = Deno.env.get('SUPABASE_URL');
      const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      const socialBody = JSON.stringify({ blog_post_id: draft.id });
      const socialHeaders = {
        'Authorization': `Bearer ${svcKey}`,
        'Content-Type': 'application/json',
      };
      let socialResult: Record<string, unknown> | null = null;
      if (isPersona) {
        const fbRes = await fetch(`${supaUrl}/functions/v1/mkt-social-facebook`, { method: 'POST', headers: socialHeaders, body: socialBody, signal: AbortSignal.timeout(30_000) })
          .then((r) => r.json()).catch((e) => ({ error: e?.message }));
        socialResult = { facebook: fbRes };
      } else {
        const [fbRes, igRes, ytRes] = await Promise.allSettled([
          fetch(`${supaUrl}/functions/v1/mkt-social-facebook`, { method: 'POST', headers: socialHeaders, body: socialBody, signal: AbortSignal.timeout(30_000) }),
          fetch(`${supaUrl}/functions/v1/mkt-social-instagram`, { method: 'POST', headers: socialHeaders, body: socialBody, signal: AbortSignal.timeout(90_000) }),
          fetch(`${supaUrl}/functions/v1/mkt-social-youtube`, { method: 'POST', headers: socialHeaders, body: socialBody, signal: AbortSignal.timeout(120_000) }),
        ]);
        socialResult = {
          facebook: fbRes.status === 'fulfilled' ? await fbRes.value.json().catch(() => null) : { error: fbRes.reason?.message },
          instagram: igRes.status === 'fulfilled' ? await igRes.value.json().catch(() => null) : { error: igRes.reason?.message },
          youtube: ytRes.status === 'fulfilled' ? await ytRes.value.json().catch(() => null) : { error: ytRes.reason?.message },
        };
      }

      results.push({
        id: draft.id,
        channel: draft.channel ?? 'company',
        product: draft.product_key,
        slot: targetSlot,
        post_urn: postUrn,
        post_url: postUrl,
        posted_as: isPersona ? 'member (persona)' : identity.isOrg ? 'organization' : 'member',
        ...(socialResult ? { social: socialResult } : {}),
      });
    }

    return ok({ success: true, posted: results.length, results });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[blog-poster] fatal:', msg);
    return err(500, msg);
  }
});
