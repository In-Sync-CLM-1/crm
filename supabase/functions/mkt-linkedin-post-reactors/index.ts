/**
 * mkt-linkedin-post-reactors — on-demand "who reacted" lookup for a single
 * persona (or company) post. Built 2026-07-24 per Arohan's recommendation:
 * "work the viewer list, not the feed" — checking who engaged with a post
 * and reaching out is the highest-return daily habit, but doing it by hand
 * means leaving crm to dig through LinkedIn's own UI. This surfaces it here.
 *
 * DELIBERATELY ON-DEMAND ONLY — called from a UI button click, never a
 * cron/scheduled job. Two reasons: (1) it stays low-volume, matching the
 * same "batches with judgment, not bulk automation" caution Arohan itself
 * gave about connection requests; (2) the name/headline resolution below
 * uses LinkedIn's people-lookup endpoint against ARBITRARY third-party
 * member ids — this works today (verified live 2026-07-24) but is NOT a
 * documented guarantee (that endpoint is normally scoped to self-lookup
 * only), so treat it as a convenience that degrades gracefully, never as
 * load-bearing infrastructure. If it starts failing, reactor identity
 * silently falls back to "unknown" rather than breaking the feature.
 *
 * Body: { blog_post_id } → { reactors: [{ urn, name, headline, reaction_type }] }
 */
import { getLinkedInIdentity } from '../_shared/linkedinAuth.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const LINKEDIN_VERSION = '202503';
const MAX_REACTORS = 20; // caps profile-lookup volume per click

function ok(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function err(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

interface Reactor {
  urn: string;
  name: string | null;
  headline: string | null;
  reaction_type: string;
}

async function resolveProfile(id: string, token: string): Promise<{ name: string | null; headline: string | null }> {
  try {
    const res = await fetch(`https://api.linkedin.com/rest/people/(id:${id})`, {
      headers: { Authorization: `Bearer ${token}`, 'Linkedin-Version': LINKEDIN_VERSION, 'X-Restli-Protocol-Version': '2.0.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { name: null, headline: null };
    const data = await res.json();
    const first = data?.localizedFirstName ?? data?.firstName?.localized?.en_US;
    const last = data?.localizedLastName ?? data?.lastName?.localized?.en_US;
    const name = [first, last].filter(Boolean).join(' ') || null;
    const headline = data?.localizedHeadline ?? data?.headline?.localized?.en_US ?? null;
    return { name, headline };
  } catch {
    return { name: null, headline: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return err(405, 'POST only');

  const supabase = getSupabaseClient();

  try {
    const { blog_post_id } = await req.json();
    if (!blog_post_id) return err(400, 'blog_post_id required');

    const { data: post, error: postErr } = await supabase
      .from('blog_posts')
      .select('org_id, linkedin_post_urn')
      .eq('id', blog_post_id)
      .maybeSingle();
    if (postErr) return err(500, postErr.message);
    if (!post) return err(404, 'post not found');
    if (!post.linkedin_post_urn) return ok({ reactors: [], note: 'post has no linkedin_post_urn yet (not posted?)' });

    const { data: config } = await supabase
      .from('mkt_linkedin_config')
      .select('*')
      .eq('org_id', post.org_id)
      .eq('active', true)
      .maybeSingle();
    if (!config) return err(400, 'no active linkedin config for this org');

    const identity = await getLinkedInIdentity(supabase, config);
    if (!identity) return err(400, 'no usable LinkedIn token');

    const entity = encodeURIComponent(post.linkedin_post_urn);
    const res = await fetch(
      `https://api.linkedin.com/rest/reactions/(entity:${entity})?q=entity&sort=(value:REVERSE_CHRONOLOGICAL)&count=${MAX_REACTORS}`,
      {
        headers: {
          Authorization: `Bearer ${identity.token}`,
          'Linkedin-Version': LINKEDIN_VERSION,
          'X-Restli-Protocol-Version': '2.0.0',
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) {
      const errText = await res.text();
      return err(502, `LinkedIn reactions ${res.status}: ${errText}`);
    }
    const data = await res.json();
    const elements = (data?.elements ?? []) as Array<{ created: { actor: string }; reactionType: string }>;

    const reactors: Reactor[] = await Promise.all(elements.slice(0, MAX_REACTORS).map(async (el) => {
      const actorUrn = el.created?.actor ?? '';
      const isPerson = actorUrn.startsWith('urn:li:person:');
      const id = actorUrn.split(':').pop() ?? '';
      const profile = isPerson && id ? await resolveProfile(id, identity.token) : { name: null, headline: null };
      return { urn: actorUrn, name: profile.name, headline: profile.headline, reaction_type: el.reactionType };
    }));

    return ok({ reactors, total: data?.paging?.total ?? reactors.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[linkedin-post-reactors] fatal:', msg);
    return err(500, msg);
  }
});
