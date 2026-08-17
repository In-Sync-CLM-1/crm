/**
 * Search and page-fetch helpers for BD research.
 *
 * Amit, 2026-08-17: "start with a google search and then fan around", and then:
 * "You are focusing on speed more than the depth of research. Do one at a time
 * but go through as much as you can." So these are built for coverage per
 * firm, not firms per minute.
 *
 * What actually works from the Supabase edge runtime — measured, not assumed:
 *   Bing HTML          200, full result set        <- web search
 *   Google News RSS    200, 11 items on a test     <- news
 *   DuckDuckGo         202 anti-bot page, 0 hits   <- unusable server-side
 *   Mojeek             503                         <- unusable
 *   LinkedIn company   999 without a session       <- unusable at any tier
 *
 * DuckDuckGo works from a laptop and fails from a datacenter, which is exactly
 * the kind of thing that silently produces empty research, so the engine choice
 * is recorded here rather than rediscovered later.
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
  const re = new RegExp('<' + tag + '[^>]*>([\s\S]*?)</' + tag + '>', 'i');
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

export async function searchWeb(query: string, max = 12): Promise<SearchHit[]> {
  try {
    const res = await fetch('https://www.bing.com/search?q=' + encodeURIComponent(query) + '&count=20', {
      headers: { 'User-Agent': SEARCH_UA, 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const hits: SearchHit[] = [];
    // Each organic result is <li class="b_algo" …attrs…> … </li>. Both the <li>
    // and the inner <h2>/<a> carry attributes, so every tag pattern here has to
    // allow them — an exact-tag match silently found nothing.
    for (const m of html.matchAll(/<li class="b_algo"[\s\S]*?<\/li>/g)) {
      const block = m[0];
      const href = block.match(/<h2[^>]*>[\s\S]{0,200}?<a[^>]+href="([^"]+)"/i);
      if (!href) continue;
      // decodeHtml FIRST: the href arrives with &amp; between query params, so
      // parsing before decoding loses the u= parameter entirely.
      const url = unwrapBing(decodeHtml(href[1]));
      if (!url || !/^https?:\/\//i.test(url) || /(^|\.)bing\.com/i.test(new URL(url).hostname)) continue;
      hits.push({
        url,
        title: tagText(block, 'h2').slice(0, 200),
        snippet: (block.match(/<p[^>]*>([\s\S]*?)<\/p>/i) ? stripTags(block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)![1]) : '').slice(0, 400),
      });
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
 * The firm's own domain, from search results. Returns null rather than
 * guessing: a wrong domain sends the entire crawl to another company, which is
 * worse than not crawling at all.
 */
export function pickOwnDomain(firmName: string, hits: SearchHit[]): string | null {
  const GENERIC = new Set([
    'inc', 'llc', 'ltd', 'the', 'and', 'labs', 'lab', 'group', 'studio', 'studios',
    'software', 'digital', 'technologies', 'technology', 'solutions', 'consulting',
    'development', 'developers', 'systems', 'services', 'company', 'agency', 'co',
  ]);
  const words = firmName.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 2 && !GENERIC.has(w));
  for (const h of hits) {
    let host: string;
    try {
      host = new URL(h.url).hostname.replace(/^www\./, '');
    } catch { continue; }
    if (NOT_OWN_SITE.test(host)) continue;
    const bare = host.split('.')[0].replace(/[^a-z0-9]/g, '');
    if (words.some((w) => bare.includes(w.slice(0, Math.min(w.length, 8))) || w.includes(bare))) {
      return 'https://' + host;
    }
  }
  return null;
}
