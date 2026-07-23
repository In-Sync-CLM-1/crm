/**
 * Resolves LinkedIn standardized-data URNs (seniority/function/industry/geo)
 * to human-readable labels. Used only by mkt-linkedin-follower-demographics —
 * the raw follower-statistics response carries URNs like urn:li:seniority:3,
 * meaningless to a human reading Arohan's context.
 *
 * Seniority and function taxonomies are small fixed lists (~10-25 entries) —
 * fetched whole via GET_ALL. Industry is a few hundred entries — also fine
 * to fetch whole. Country geo is a large taxonomy; only the specific
 * country URNs actually present in a follower-statistics response are
 * looked up individually (realistically a handful for a young page).
 */

interface LocaleName { localized?: Record<string, string> }

function firstLocaleValue(name: LocaleName | undefined): string | null {
  if (!name?.localized) return null;
  const values = Object.values(name.localized);
  return values[0] ?? null;
}

async function getAll(token: string, path: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const res = await fetch(`https://api.linkedin.com/v2/${path}?count=1000`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Restli-Protocol-Version': '2.0.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`[linkedinTaxonomy] GET_ALL ${path} ${res.status}`);
      return map;
    }
    const data = await res.json();
    for (const el of data.elements ?? []) {
      const urn = el.$URN as string | undefined;
      const name = firstLocaleValue(el.name);
      if (urn && name) map.set(urn, name);
    }
  } catch (e) {
    console.warn(`[linkedinTaxonomy] GET_ALL ${path} failed:`, e instanceof Error ? e.message : e);
  }
  return map;
}

/**
 * Geo lookup — a different schema/endpoint from the other taxonomies
 * (defaultLocalizedName.value, not name.localized; needs the Restli
 * protocol header). https://api.linkedin.com/v2/geo/{id}
 */
async function getGeoName(token: string, urn: string): Promise<string | null> {
  const id = urn.split(':').pop();
  try {
    const res = await fetch(`https://api.linkedin.com/v2/geo/${id}?locale=(language:en,country:US)`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Restli-Protocol-Version': '2.0.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.defaultLocalizedName?.value ?? null;
  } catch {
    return null;
  }
}

export interface TaxonomyResolver {
  seniority: (urn: string) => string;
  jobFunction: (urn: string) => string;
  industry: (urn: string) => string;
  country: (urn: string) => Promise<string>;
}

/** Loads the small fixed taxonomies once; country names are resolved lazily per-URN and cached. */
export async function buildTaxonomyResolver(token: string): Promise<TaxonomyResolver> {
  const [seniorities, functions, industries] = await Promise.all([
    getAll(token, 'seniorities'),
    getAll(token, 'functions'),
    getAll(token, 'industries'),
  ]);
  const countryCache = new Map<string, string>();

  return {
    seniority: (urn) => seniorities.get(urn) ?? urn,
    jobFunction: (urn) => functions.get(urn) ?? urn,
    industry: (urn) => industries.get(urn) ?? urn,
    country: async (urn) => {
      if (countryCache.has(urn)) return countryCache.get(urn)!;
      const name = (await getGeoName(token, urn)) ?? urn;
      countryCache.set(urn, name);
      return name;
    },
  };
}
