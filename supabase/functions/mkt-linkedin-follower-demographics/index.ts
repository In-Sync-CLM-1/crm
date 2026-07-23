/**
 * mkt-linkedin-follower-demographics — weekly sync of the In-Sync LinkedIn
 * page's aggregate follower audience composition (seniority, job function,
 * industry, country).
 *
 * Origin (2026-07-23, Arohan brief): Amit wanted per-post engager demographics
 * (job title/seniority/industry/geo of the specific people who interacted
 * with each post) as the audience signal for responsible Facebook ad
 * targeting. That data does not exist in LinkedIn's API at any access tier —
 * verified against the July 2026 Marketing/Community Management API docs;
 * organizationalEntityShareStatistics returns only aggregate impression/
 * click/like/comment/share counts, no demographic dimension, and no
 * follower-vs-non-follower impression split either. This function pulls the
 * closest REAL substitute: organizationalEntityFollowerStatistics, the
 * aggregate demographic composition of the page's whole follower base —
 * a genuine, current picture of who the audience actually is.
 *
 * Called weekly (cron-worker "linkedin-follower-demographics"). One snapshot
 * row per org per ISO week. Feeds mkt-arohan-chat's context (so Arohan can
 * "review" it, per the brief) and gates mkt-ad-campaign-generator's Meta
 * path (no Meta campaign launches until at least one snapshot exists).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { getLinkedInIdentity } from '../_shared/linkedinAuth.ts';
import { buildTaxonomyResolver } from '../_shared/linkedinTaxonomy.ts';

const LINKEDIN_VERSION = '202503';

function ok(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function err(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// IST calendar week (Mon-Sun) — matches mkt-social-boost's weekStartIST so
// snapshot cadence lines up with the rest of the weekly marketing cycle.
function weekStartIST(d: Date): string {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const day = ist.getUTCDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  ist.setUTCDate(ist.getUTCDate() - diffToMonday);
  return ist.toISOString().slice(0, 10);
}

interface CountEntry { organicFollowerCount?: number; paidFollowerCount?: number }
type FacetRow = Record<string, unknown> & { followerCounts: CountEntry };

function topN(rows: Array<{ label: string; count: number }>, n = 15) {
  return rows.filter((r) => r.count > 0).sort((a, b) => b.count - a.count).slice(0, n);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const { data: configs, error: cfgErr } = await supabase
      .from('mkt_linkedin_config')
      .select('*')
      .eq('active', true);
    if (cfgErr) return err(500, cfgErr.message);
    if (!configs?.length) return ok({ skip: 'no active linkedin config' });

    const results: Record<string, unknown>[] = [];
    const snapshotDate = weekStartIST(new Date());

    for (const config of configs) {
      const identity = await getLinkedInIdentity(supabase, config);
      if (!identity?.isOrg) {
        results.push({ org_id: config.org_id, skip: 'no org (company-page) LinkedIn identity available' });
        continue;
      }

      const orgUrn = identity.authorUrn;
      const res = await fetch(
        `https://api.linkedin.com/rest/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(orgUrn)}`,
        {
          headers: {
            Authorization: `Bearer ${identity.token}`,
            'LinkedIn-Version': LINKEDIN_VERSION,
            'X-Restli-Protocol-Version': '2.0.0',
          },
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (!res.ok) {
        const errText = await res.text();
        results.push({ org_id: config.org_id, error: `followerStatistics ${res.status}: ${errText}` });
        continue;
      }
      const data = await res.json();
      const el = data?.elements?.[0];
      if (!el) {
        results.push({ org_id: config.org_id, skip: 'no follower statistics returned' });
        continue;
      }

      const resolver = await buildTaxonomyResolver(identity.token);
      const count = (r: CountEntry) => (r.organicFollowerCount ?? 0) + (r.paidFollowerCount ?? 0);

      const bySeniority = topN(((el.followerCountsBySeniority ?? []) as FacetRow[]).map((r) => ({
        label: resolver.seniority(r.seniority as string), count: count(r.followerCounts),
      })));
      const byFunction = topN(((el.followerCountsByFunction ?? []) as FacetRow[]).map((r) => ({
        label: resolver.jobFunction(r.function as string), count: count(r.followerCounts),
      })));
      const byIndustry = topN(((el.followerCountsByIndustry ?? []) as FacetRow[]).map((r) => ({
        label: resolver.industry(r.industry as string), count: count(r.followerCounts),
      })));

      const countryRows = (el.followerCountsByGeoCountry ?? []) as FacetRow[];
      // Total is summed from the FULL country list, before truncating to the
      // top 15 stored/displayed — otherwise a page with >15 follower
      // countries would silently under-report its real follower count.
      const totalFollowers = countryRows.reduce((s, r) => s + count(r.followerCounts), 0) || null;
      const byCountry = topN(await Promise.all(countryRows.map(async (r) => ({
        label: await resolver.country(r.geo as string), count: count(r.followerCounts),
      }))));

      const { error: upsertErr } = await supabase
        .from('mkt_linkedin_follower_demographics')
        .upsert({
          org_id: config.org_id,
          snapshot_date: snapshotDate,
          total_followers: totalFollowers,
          by_seniority: bySeniority,
          by_function: byFunction,
          by_industry: byIndustry,
          by_country: byCountry,
        }, { onConflict: 'org_id,snapshot_date' });

      if (upsertErr) {
        results.push({ org_id: config.org_id, error: upsertErr.message });
        continue;
      }

      console.log(`[linkedin-follower-demographics] synced org ${config.org_id}: ${bySeniority.length} seniorities, ${byFunction.length} functions, ${byIndustry.length} industries, ${byCountry.length} countries`);
      results.push({ org_id: config.org_id, synced: true, snapshot_date: snapshotDate });
    }

    return ok({ results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[linkedin-follower-demographics] fatal:', msg);
    return err(500, msg);
  }
});
