/**
 * Shared Meta (Facebook/Instagram) Marketing API helpers.
 *
 * WHY THIS EXISTS: three functions create Meta ad objects — mkt-social-boost
 * (weekly boost of the best organic post), mkt-meta-ads-launch (per-product
 * traffic campaigns) and mkt-meta-followers-launch (Page-likes campaign).
 * Each carried its own copy of the same Graph call plumbing, so when Meta
 * started rejecting three specific fields the fixes were applied to two of
 * them and mkt-social-boost was missed. It then failed on its FIRST Graph
 * call, every week, silently, from 2026-08-03 until 2026-08-14.
 *
 * Everything Meta is strict about now lives here so it cannot drift again.
 * The three requirements, each found the hard way against the live account:
 *
 *  1. Campaign create must pass `is_adset_budget_sharing_enabled` explicitly
 *     (error_subcode 4834011) whenever the budget sits on the ad set rather
 *     than the campaign — which is how all three of ours are built.
 *  2. `flexible_spec` interests must be real `{id, name}` objects, never bare
 *     `{name}` strings. Bare names fail with the thoroughly unhelpful
 *     "type integer is expected but a type NULL was received" (subcode
 *     1885097). Resolve via GET /act_<id>/targetingsearch?type=adinterest.
 *  3. Ad set targeting must set `targeting_automation.advantage_audience`
 *     explicitly, or Meta rejects the ad set.
 */

/** Graph API version. Meta supports ~2 years per version; bump deliberately. */
export const FB_API_VERSION = 'v21.0';

/**
 * Default B2B-ish interest targeting, as real Meta interest IDs. Verified
 * live against act_1503032350759926 (2026-08-14) — IDs are stable per
 * interest but re-resolve with `resolveInterests` if Meta ever retires one.
 */
export const DEFAULT_INTERESTS: MetaInterest[] = [
  { id: '6002884511422', name: 'Small business (business & finance)' },
  { id: '6003371567474', name: 'Entrepreneurship (business & finance)' },
  { id: '6003388372512', name: 'Business software (software)' },
];

export interface MetaInterest {
  id: string;
  name: string;
}

/** POST to a Graph edge. Throws with the full Meta error body — those bodies
 *  carry the only useful diagnostics (error_subcode / error_user_msg), so
 *  they must never be swallowed. */
export async function fbPost(
  path: string,
  token: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    body.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  body.set('access_token', token);
  const res = await fetch(`https://graph.facebook.com/${FB_API_VERSION}/${path}`, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`FB Graph API ${res.status} on ${path}: ${JSON.stringify(json)}`);
  return json;
}

/** Best-effort delete of a Graph object. Never throws — it is only ever used
 *  to tidy up after a failure, and must not mask the original error. */
export async function fbDelete(id: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/${FB_API_VERSION}/${id}?access_token=${encodeURIComponent(token)}`,
      { method: 'DELETE', signal: AbortSignal.timeout(15_000) },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Resolves interest names to the real `{id, name}` objects Meta requires.
 * Falls back to DEFAULT_INTERESTS for any term that cannot be resolved, so a
 * targeting-search hiccup degrades to sane targeting instead of a 400.
 */
export async function resolveInterests(
  actId: string,
  token: string,
  terms: string[],
): Promise<MetaInterest[]> {
  const out: MetaInterest[] = [];
  for (const term of terms) {
    try {
      const url =
        `https://graph.facebook.com/${FB_API_VERSION}/${actId}/targetingsearch` +
        `?type=adinterest&limit=1&q=${encodeURIComponent(term)}` +
        `&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      const json = await res.json();
      const hit = json?.data?.[0];
      if (hit?.id) out.push({ id: String(hit.id), name: String(hit.name ?? term) });
    } catch {
      // fall through to the default set below
    }
  }
  return out.length ? out : DEFAULT_INTERESTS;
}

/**
 * The ad-set targeting block, with both fields Meta requires already set.
 * Build targeting through this rather than by hand.
 */
export function buildTargeting(opts: {
  interests: MetaInterest[];
  platforms: string[];
  ageMin?: number;
  ageMax?: number;
  countries?: string[];
}): Record<string, unknown> {
  return {
    geo_locations: { countries: opts.countries ?? ['IN'] },
    age_min: opts.ageMin ?? 25,
    age_max: opts.ageMax ?? 55,
    flexible_spec: [{ interests: opts.interests }],
    publisher_platforms: opts.platforms,
    targeting_automation: { advantage_audience: 0 },
  };
}

/**
 * Extracts Meta's human-readable reason from a thrown fbPost error, so
 * operators see "Certification required — ..." rather than a wall of JSON.
 */
export function describeMetaError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const start = raw.indexOf('{');
  if (start === -1) return raw;
  try {
    const err = JSON.parse(raw.slice(start))?.error ?? {};
    const parts = [err.error_user_title, err.error_user_msg ?? err.message].filter(Boolean);
    const detail = parts.length ? parts.join(' — ') : raw;
    return err.error_subcode ? `${detail} (subcode ${err.error_subcode})` : detail;
  } catch {
    return raw;
  }
}
