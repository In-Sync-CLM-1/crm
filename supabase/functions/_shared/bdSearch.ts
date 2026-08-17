/**
 * Search and page-fetch helpers for BD research.
 *
 * Amit, 2026-08-17: "start with a google search and then fan around", and then:
 * "You are focusing on speed more than the depth of research. Do one at a time
 * but go through as much as you can." So these are built for coverage per
 * firm, not firms per minute.
 *
 * What actually works from the Supabase edge runtime — measured on a firm whose
 * site definitely exists (caxy.com), not assumed:
 *   Brave              200, relevant results       <- web search (chosen)
 *   Google News RSS    200, 11 items               <- news
 *   Bing               200 but IRRELEVANT results  <- reads as working; a bare
 *                                                     "Caxy" query returned
 *                                                     accuweather and zhihu
 *   DuckDuckGo         202 anti-bot page           <- works from a laptop only
 *   Ecosia             403
 *   LinkedIn company   999 without a session       <- unusable at any tier
 *
 * Two traps worth keeping in mind: an engine that answers 200 with a full page
 * can still be useless, and an engine that works from a laptop can fail from a
 * datacenter. Both produce silently empty research rather than an error.
 */

export const SEARCH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

/** Directories, socials and job boards: fine as evidence, never the firm's own site. */
export const NOT_OWN_SITE =
  /(^|\.)(clutch\.co|linkedin\.com|facebook\.com|twitter\.com|x\.com|instagram\.com|glassdoor\.|indeed\.|crunchbase\.com|goodfirms\.co|designrush\.com|upwork\.com|medium\.com|youtube\.com|wikipedia\.org|bloomberg\.com|zoominfo\.com|apollo\.io|g2\.com|trustpilot\.|yelp\.|producthunt\.com|github\.com|reddit\.com)/i;

/** Third-party profiles worth reading in full — they list clients and work. */
export const DIRECTORY_WORTH_READING = /(clutch\.co|goodfirms\.co|designrush\.com|crunchbase\.com)/i;

export interface SearchHit { title: string; url: string; snippet: string }
export interface NewsItem { title: string; date: string; url: string; source: string }

export function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** One tag's contents. Built by concatenation — a template literal would eat
 *  the backslashes and turn [\s\S] into [sS], which matches nothing. */
function tagText(block: string, tag: string): string {
  // NOTE: the class is written [\\s\\S] on purpose. This is a normal quoted
  // string, so a single backslash is consumed by the string literal and the
  // pattern silently degrades to [sS], which matches nothing — every parsed
  // title came back as ''. Verified by running the module, not by reading it.
  const re = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>', 'i');
  const m = block.match(re);
  if (!m) return '';
  return stripTags(m[1].replace(/<!\[CDATA\[|\]\]>/g, '')).trim();
}

export async function fetchPage(
  url: string,
  timeoutMs = 15_000,
): Promise<{ text: string; finalUrl: string; status: number } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': SEARCH_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return { text: stripTags(await res.text()), finalUrl: res.url, status: res.status };
  } catch {
    return null;
  }
}

/**
 * Web search via Bing's HTML results. Returns [] on any failure — research
 * continues on whatever else it can reach.
 */
/** Bing wraps every result in https://www.bing.com/ck/a?…&u=a1<base64url>&…
 *  Unwrap it to the real destination; without this every hit looks like Bing. */
function unwrapBing(href: string): string | null {
  try {
    if (!/bing\.com\/ck\/a/i.test(href)) return href;
    const u = new URL(href, 'https://www.bing.com');
    const raw = u.searchParams.get('u');
    if (!raw) return null;
    // The target is base64url, prefixed with "a1".
    const b64 = raw.replace(/^a1/, '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const decoded = atob(pad);
    return /^https?:\/\//i.test(decoded) ? decoded : null;
  } catch { return null; }
}

function decodeHtml(t: string): string {
  return t.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/**
 * Web search via Brave. Returns [] on any failure — research continues on
 * whatever else answers.
 *
 * Brave, after measuring all four candidates from the edge runtime on a firm
 * whose site definitely exists (caxy.com):
 *   Brave       200, 341 mentions   <- relevant results, direct hrefs
 *   Bing        200,  34 mentions   <- answers, but serves degraded results to
 *                                     automated requests: a bare "Caxy" query
 *                                     returned accuweather and zhihu, and
 *                                     caxy.com appeared nowhere in 10 blocks
 *   DuckDuckGo  202                 <- anti-bot page (works from a laptop)
 *   Ecosia      403
 * Bing's failure is the subtle one: it returns HTTP 200 with a full-looking
 * page, so it reads as working right up until you check whether the results
 * relate to the query.
 */
export async function searchWeb(query: string, max = 12): Promise<SearchHit[]> {
  // Brave answers 200 with a result-less page when it decides a caller is too
  // busy, and it counts ALL traffic from the IP — so a firm's 16 page fetches
  // are enough to get the NEXT firm's search throttled. Measured: searches
  // interleaved with crawling returned 12, 12, then 0 hits. Retrying after a
  // pause recovers it, which is worth doing because a lost search means a lost
  // domain and therefore no research for that firm at all.
  // Two attempts, not three, and a flat 3s pause: the first version used a
  // rising backoff and a 15s per-attempt timeout, which took a 4-firm run to 22
  // minutes. One retry recovers the throttled case (verified: Caxy and SmallCo
  // went from 0 hits to 12 and yielded their real domains) without that cost.
  const hits = await searchOnce(query, max);
  if (hits.length) return hits;
  await new Promise((r) => setTimeout(r, 3000));
  return await searchOnce(query, max);
}

async function searchOnce(query: string, max: number): Promise<SearchHit[]> {
  try {
    const res = await fetch('https://search.brave.com/search?q=' + encodeURIComponent(query), {
      headers: { 'User-Agent': SEARCH_UA, 'Accept-Language': 'en-US,en;q=0.9' },
      // 8s, not 15s: two attempts at 15s plus backoff is most of a firm's
      // time budget, and a throttled Brave answers fast anyway.
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const hits: SearchHit[] = [];
    const seen = new Set<string>();
    // Each organic result opens with <div class="snippet …" data-type="web">.
    // Blocks are delimited by the NEXT block's start rather than by a closing
    // tag: the markup is deeply nested svelte output, so any </div> pattern
    // either stops short or runs away. Slicing between starts is exact.
    const starts = [...html.matchAll(/<div class="snippet[^"]*"[^>]*data-type="web"/g)].map((m) => m.index!);
    for (let i = 0; i < starts.length; i++) {
      const block = html.slice(starts[i], starts[i + 1] ?? Math.min(starts[i] + 6000, html.length));
      const href = block.match(/<a[^>]+href="(https?:\/\/[^"]+)"/i);
      if (!href) continue;
      const url = decodeHtml(href[1]);
      let host: string;
      try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { continue; }
      if (/(^|\.)(brave\.com|search\.brave\.com)$/i.test(host)) continue;
      if (seen.has(host)) continue;           // one hit per host is plenty
      seen.add(host);
      // Class names are hashed svelte output, so match on the meaningful part.
      const title = stripTags((block.match(/class="[^"]*title[^"]*"[^>]*>([\s\S]{0,300}?)<\/div>/i) || [])[1] || '');
      const snippet = stripTags((block.match(/class="[^"]*snippet-description[^"]*"[^>]*>([\s\S]{0,600}?)<\/div>/i) || [])[1] || '');
      hits.push({ url, title: title.slice(0, 200), snippet: snippet.slice(0, 400) });
      if (hits.length >= max) break;
    }
    return hits;
  } catch {
    return [];
  }
}

/** Google News RSS, filtered to items that name the firm verbatim. */
export async function searchNews(firmName: string, max = 6): Promise<NewsItem[]> {
  try {
    const url = 'https://news.google.com/rss/search?q=' +
      encodeURIComponent('"' + firmName + '"') + '&hl=en-US&gl=US&ceid=US:en';
    const res = await fetch(url, { headers: { 'User-Agent': SEARCH_UA }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return [];
    const xml = await res.text();
    const needle = firmName.toLowerCase();
    const out: NewsItem[] = [];
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const block = m[1];
      const title = tagText(block, 'title');
      const desc = tagText(block, 'description');
      // A headline sharing one word with the firm is not about the firm. The
      // phrase must appear verbatim — the same rule the fact extractor follows.
      if (!(title + ' ' + desc).toLowerCase().includes(needle)) continue;
      out.push({
        title: title.slice(0, 220),
        date: tagText(block, 'pubDate').slice(0, 16),
        url: tagText(block, 'link'),
        source: tagText(block, 'source').slice(0, 80),
      });
      if (out.length >= max) break;
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * The firm's own domain, chosen by score rather than by result order.
 *
 * Order alone was wrong in a way that mattered: searching "Atomic Object"
 * returned atomicmail.io first, and taking the top non-directory hit sent the
 * whole crawl to an unrelated consumer product. The rule now is that EVERY
 * distinctive word in the firm name must appear in the host, so "Atomic
 * Object" needs both "atomic" and "object" — atomicmail.io has one and scores
 * zero. Verified against 15 real firm/host pairs including that failure.
 *
 * Returns null when nothing scores: a wrong domain is worse than no domain,
 * because the extractor would then quote another company's clients verbatim.
 */
const GENERIC_WORDS = new Set([
  'inc', 'llc', 'ltd', 'the', 'and', 'labs', 'lab', 'group', 'studio', 'studios',
  'software', 'digital', 'technologies', 'technology', 'solutions', 'consulting',
  'development', 'developers', 'systems', 'services', 'company', 'agency', 'co',
]);

const squash = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');

/** 0 = unrelated, 70+ = confident enough to crawl. */
export function scoreHost(firmName: string, host: string): number {
  const bare = squash(host.split('.')[0]);
  const full = squash(firmName);
  if (!bare) return 0;
  if (bare === full) return 100;
  if (bare.includes(full) || full.includes(bare)) return 90;

  const words = firmName.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 2 && !GENERIC_WORDS.has(w));
  if (!words.length) return 0;

  const present = words.filter((w) => bare.includes(w));
  if (present.length === words.length) return 80;
  if (words.length === 1 && present.length === 1) return 70;
  return 0;
}

export function pickOwnDomain(firmName: string, hits: SearchHit[]): string | null {
  let best: { host: string; score: number } | null = null;
  for (const h of hits) {
    let host: string;
    try {
      host = new URL(h.url).hostname.replace(/^www\./, '');
    } catch { continue; }
    if (NOT_OWN_SITE.test(host)) continue;
    const score = scoreHost(firmName, host);
    if (score >= 70 && (!best || score > best.score)) best = { host, score };
  }
  return best ? 'https://' + best.host : null;
}

