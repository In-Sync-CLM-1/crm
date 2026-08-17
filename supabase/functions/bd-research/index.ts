/**
 * bd-research — fetch a firm's own pages and extract facts VERBATIM.
 *
 * Never paraphrases and never infers: the first line of every email is built
 * from these facts, and an inferred fact produces a line that reads as
 * generated. Absent means `none`, not a guess.
 *
 * Also runs the disqualifier pass over the fetched text and records the hits
 * as FLAGS. It never drops a firm — six of fifteen batch-1 picks failed here
 * after clearing every automated filter, which is exactly why a human reads
 * them.
 *
 *   POST { limit: 8 }         research the next N unresearched A/B firms
 *   POST { firm_ids: [...] }  research specific firms
 *   POST { no_continue: true } do not self-continue after the deadline
 *
 * DEPTH over speed (Amit, 2026-08-17: "You are focusing on speed more than the
 * depth of research. Do one at a time but go through as much as you can.").
 * Each firm now goes through five sources before the next firm starts:
 *
 *   1. Bing web search        -> discovers the real domain, which only 10 of
 *                                270 rows arrived with; guessing firmname.com
 *                                sent the crawl to the wrong company often
 *   2. Apollo org enrichment  -> headcount, founding year, industry, tech
 *                                stack, LinkedIn URL, description. This is the
 *                                LinkedIn substitute: LinkedIn's own API
 *                                returns nothing for companies we do not
 *                                administer (tested), and its public pages
 *                                answer HTTP 999
 *   3. The firm's own site    -> 16 paths instead of 8
 *   4. Directory profiles     -> Clutch / Crunchbase / GoodFirms pages found
 *                                in step 1, read in full
 *   5. Google News            -> items naming the firm verbatim
 *
 * Fewer firms per run, far more evidence each. The deadline plus
 * self-continuation means a long run is never cut off mid-firm.
 *
 * Throughput (reworked 2026-08-17 — 161 graded firms were queued behind a
 * 6-per-run cap, about a fortnight of waiting):
 *   - a firm's 8 pages are fetched CONCURRENTLY at 3 at a time instead of
 *     sequentially with a 2s sleep between each, which takes a firm from ~20s
 *     to ~4s. Three parallel requests to one host is ordinary browser
 *     behaviour, and firms are still processed one at a time so no host sees
 *     more than that.
 *   - the run stops at an internal DEADLINE and re-invokes itself for the
 *     rest, so a batch is never cut off mid-firm by the platform's 150s idle
 *     timeout leaving a half-written row.
 */
import { BD_ORG_ID, disqualifierFlags, CONFIG } from '../_shared/bdPipeline.ts';
import {
  searchWeb, searchNews, pickOwnDomain, fetchPage as fetchOne,
  NOT_OWN_SITE, DIRECTORY_WORTH_READING,
} from '../_shared/bdSearch.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const ok = (d: unknown) => new Response(JSON.stringify(d), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const err = (s: number, m: string) => new Response(JSON.stringify({ error: m }), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Crawl surface. Widened from 8 to 16: the extra paths are where client
// names and case studies actually live on agency sites.
const PATHS = [
  '', '/about', '/about-us', '/services', '/what-we-do',
  '/work', '/our-work', '/portfolio', '/projects',
  '/case-studies', '/case-study', '/clients', '/customers',
  '/team', '/industries', '/expertise',
];

/** Strip tags and collapse whitespace — we want readable prose, not markup. */
function textOf(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fetch several URLs with a small concurrency cap, preserving input order. */
async function fetchAll(urls: string[], concurrency = 3): Promise<({ text: string; finalUrl: string } | null)[]> {
  const out: ({ text: string; finalUrl: string } | null)[] = new Array(urls.length).fill(null);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= urls.length) return;
      out[i] = await fetchPage(urls[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function fetchPage(url: string): Promise<{ text: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; research/1.0)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return { text: textOf(await res.text()), finalUrl: res.url };
  } catch { return null; }
}

// Words that appear in headings and marketing copy around a client list and
// get mistaken for company names — the first pass pulled out "Clients Say",
// "Great" and "Results" as clients, which would have produced a first line
// naming something the firm does not recognise.
const NOT_A_COMPANY = new Set([
  'clients', 'client', 'customers', 'customer', 'trusted', 'say', 'says', 'what',
  'great', 'results', 'our', 'we', 'us', 'your', 'their', 'the', 'this', 'that',
  'more', 'about', 'work', 'works', 'case', 'cases', 'study', 'studies', 'story',
  'stories', 'read', 'view', 'all', 'see', 'learn', 'contact', 'home', 'services',
  'solutions', 'team', 'leadership', 'partners', 'testimonials', 'reviews',
  'projects', 'portfolio', 'industries', 'success', 'why', 'how', 'who', 'from',
  'with', 'and', 'for', 'you', 'they', 'have', 'has', 'been', 'was', 'were',
  'llc', 'inc', 'ltd', 'corp', 'company', 'group', 'get', 'started', 'let', 'talk',
  'privacy', 'policy', 'terms', 'cookie', 'blog', 'news', 'careers', 'jobs',
]);

const TITLE_WORDS = /\b(chief|officer|president|director|manager|founder|ceo|cto|coo|vp|partner|principal|leader|lead|producer|engineer|designer|developer|consultant|analyst|specialist)\b/i;

// Regions and continents read as capitalised names but are never clients.
const PLACES = new Set([
  'europe', 'asia', 'africa', 'america', 'north america', 'south america',
  'middle east', 'united states', 'usa', 'us', 'uk', 'canada', 'australia',
  'india', 'emea', 'apac', 'latam', 'worldwide', 'global', 'nationwide',
]);

function looksLikeCompany(candidate: string): boolean {
  const tokens = candidate.split(/\s+/);
  if (PLACES.has(candidate.toLowerCase())) return false;
  if (tokens.length > 4 || candidate.length < 3 || candidate.length > 48) return false;
  if (tokens.every((t) => NOT_A_COMPANY.has(t.toLowerCase()))) return false;
  // A leading generic word means the match ran into a heading.
  if (NOT_A_COMPANY.has(tokens[0].toLowerCase())) return false;
  // Job titles swept up from a team page.
  if (TITLE_WORDS.test(candidate)) return false;
  return true;
}

const STACK = ['Salesforce', 'HubSpot', 'Dynamics 365', 'NetSuite', 'SAP', 'Oracle', 'ServiceNow',
  'Bullhorn', 'Zoho', 'Odoo', 'Shopify', 'Magento', 'Snowflake', 'Databricks',
  'AS/400', 'VB6', 'FoxPro', 'Delphi', 'COBOL', 'Mulesoft', 'Boomi', 'Twilio'];

const VERTICALS = ['healthcare', 'insurance', 'financial services', 'banking', 'lending',
  'manufacturing', 'logistics', 'distribution', 'retail', 'education', 'nonprofit',
  'government', 'legal', 'real estate', 'construction', 'energy', 'staffing',
  'recruitment', 'hospitality', 'automotive', 'telecom'];

const CLIENT_CUE = /(?:our clients?|client list|customers include|trusted by|partnered with|worked with|clients include)[^.]{0,240}/gi;
const CAPITALISED = /[A-Z][A-Za-z0-9&.]*(?: [A-Z][A-Za-z0-9&.]*){0,3}/g;
const TEAM = /([A-Z][a-z]+ [A-Z][a-z]+)\s*(?:[,—–-]\s*)?((?:Chief [A-Z][a-z]+ Officer|Co-?[Ff]ounder|Founder|CEO|CTO|COO|CIO|President|VP of [A-Z][a-z]+|Vice President|Director of [A-Z][a-z]+|Head of [A-Z][a-z]+|Managing Partner|Principal))/g;
const CASE_TITLE = /(?:case study|success story)[:\s—–-]+([A-Z][^.|\n]{8,90})/gi;

/** Extract as written. A wrong "client" is worse than a missing one. */
function extractFacts(text: string, firmName: string) {
  const facts: Record<string, string[]> = { clients: [], cases: [], verticals: [], stack: [], team: [] };

  // Exact string matches — the most reliable extract, no guessing involved.
  for (const s of STACK) {
    const escaped = s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    if (new RegExp('\\b' + escaped + '\\b', 'i').test(text)) facts.stack.push(s);
  }

  // Industries they explicitly CLAIM. A passing mention of "healthcare" in a
  // blog title is not a claimed vertical, so require a claiming phrase nearby.
  for (const v of VERTICALS) {
    const re = new RegExp('(industries?|verticals?|sectors?|clients? in|specializ\\w+ in|serve|serving|expertise in)[^.]{0,120}\\b' + v + '\\b', 'i');
    if (re.test(text)) facts.verticals.push(v);
  }

  let m: RegExpExecArray | null;

  const seenTeam = new Set<string>();
  while ((m = TEAM.exec(text)) !== null && facts.team.length < 12) {
    // "Operations Leader — Founder" is a role phrase that matched the
    // name pattern, not a person.
    if (TITLE_WORDS.test(m[1])) continue;
    const entry = `${m[1]} — ${m[2].trim()}`;
    if (!seenTeam.has(entry)) { seenTeam.add(entry); facts.team.push(entry); }
  }
  TEAM.lastIndex = 0;

  while ((m = CLIENT_CUE.exec(text)) !== null && facts.clients.length < 20) {
    for (const cand of m[0].match(CAPITALISED) || []) {
      const clean = cand.trim();
      if (!looksLikeCompany(clean)) continue;
      if (clean.toLowerCase() === firmName.toLowerCase()) continue;
      // A person's first name lifted out of a quote attribution ("Ray" from
      // "Ray Fanous, COO") is not a client.
      if (facts.team.some((t) => t.toLowerCase().includes(clean.toLowerCase()))) continue;
      if (!facts.clients.includes(clean)) facts.clients.push(clean);
    }
  }
  CLIENT_CUE.lastIndex = 0;

  while ((m = CASE_TITLE.exec(text)) !== null && facts.cases.length < 12) facts.cases.push(m[1].trim());
  CASE_TITLE.lastIndex = 0;

  return facts;
}

/**
 * Apollo organisation enrichment — the practical stand-in for LinkedIn.
 *
 * LinkedIn's API returns companies we administer and nothing else (verified:
 * a vanityName lookup for a target firm answers 200 with total 0), and its
 * public pages answer 999 to any unauthenticated fetch. Apollo returns the
 * same shape of firmographics for any domain, and the key is already in use
 * by bd-contacts.
 */
async function apolloOrg(domain: string): Promise<Record<string, unknown> | null> {
  const key = Deno.env.get('APOLLO_API_KEY');
  if (!key) return null;
  try {
    const host = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const res = await fetch(
      'https://api.apollo.io/api/v1/organizations/enrich?domain=' + encodeURIComponent(host),
      { headers: { 'Content-Type': 'application/json', 'x-api-key': key }, signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return null;
    const j = await res.json();
    const o = j?.organization;
    if (!o) return null;
    return {
      name: o.name ?? null,
      industry: o.industry ?? null,
      headcount: o.estimated_num_employees ?? null,
      founded_year: o.founded_year ?? null,
      linkedin_url: o.linkedin_url ?? null,
      city: o.city ?? null,
      state: o.state ?? null,
      keywords: Array.isArray(o.keywords) ? o.keywords.slice(0, 15) : [],
      technologies: Array.isArray(o.technology_names) ? o.technology_names.slice(0, 25) : [],
      description: typeof o.short_description === 'string' ? o.short_description.slice(0, 600) : null,
    };
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = getSupabaseClient();

  try {
    const body = await req.json().catch(() => ({}));
    // Deadline well inside the platform's 150s idle timeout, with room for the
    // final writes. Whatever is left over is picked up by the self-continuation
    // below rather than being lost.
    const startedAt = Date.now();
    const DEADLINE_MS = 95_000;
    const outOfTime = () => Date.now() - startedAt > DEADLINE_MS;
    // Depth, not volume: each firm now costs five sources, so the batch is
    // smaller and the self-continuation carries the rest.
    const limit = Math.min(Number(body.limit) || 8, 25);
    const COLS = 'id, firm_name, city, state, website, other_services, research_facts, researched_at';

    const query = body.firm_ids?.length
      ? supabase.from('bd_firms').select(COLS).eq('org_id', BD_ORG_ID).in('id', body.firm_ids)
      : supabase.from('bd_firms').select(COLS).eq('org_id', BD_ORG_ID)
          .is('state_flag', null).in('grade', ['A', 'B'])
          .is('researched_at', null)
          .order('grade', { ascending: true }).limit(limit);

    const { data: firms, error } = await query;
    if (error) return err(500, error.message);
    if (!firms?.length) return ok({ skip: 'nothing to research' });

    const results: Record<string, unknown>[] = [];

    let ranOutOfTime = false;
    for (const f of firms) {
      if (outOfTime()) { ranOutOfTime = true; break; }

      const sources: string[] = [];
      let combined = '';
      let reachedAny = false;
      let redirectedTo: string | null = null;

      // ── 1. Web search ─────────────────────────────────────────────────────
      // Runs first because it answers "where does this firm actually live".
      const hits = await searchWeb(
        '"' + f.firm_name + '" software development company clients case study',
      );
      const discovered = pickOwnDomain(String(f.firm_name), hits);
      if (hits.length) sources.push('search:' + hits.length);

      const stored = (f as { website?: string }).website;
      const domain = stored
        || discovered
        || 'https://' + String(f.firm_name).toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
      const domainSource = stored ? 'stored' : discovered ? 'search' : 'guessed';

      // Search snippets are verbatim third-party text, so they are safe to
      // feed the extractor — it never infers, it only quotes.
      const snippets = hits.slice(0, 8).map((h) => h.title + '. ' + h.snippet).join(' ');
      if (snippets) combined += ' ' + snippets;

      // ── 2. Apollo firmographics ───────────────────────────────────────────
      const apollo = await apolloOrg(domain);
      if (apollo) {
        sources.push('apollo');
        // Fold the description and keywords into the extractor's input; the
        // structured fields are stored separately below.
        combined += ' ' + [apollo.description, (apollo.keywords as string[]).join(', ')]
          .filter(Boolean).join('. ');
      }

      // ── 3. The firm's own site ────────────────────────────────────────────
      const base = domain.replace(/\/$/, '');
      const pages = await fetchAll(PATHS.map((path) => base + path), 3);
      let ownPages = 0;
      for (const page of pages) {
        if (!page) continue;
        reachedAny = true;
        ownPages++;
        combined += ' ' + page.text.slice(0, 20_000);
        // A redirect landing on a different company name is an acquisition.
        try {
          const host = new URL(page.finalUrl).hostname.replace(/^www\./, '');
          const expected = new URL(domain).hostname.replace(/^www\./, '');
          if (host !== expected) redirectedTo = host;
        } catch { /* malformed URL — not a redirect signal */ }
      }
      if (ownPages) sources.push('site:' + ownPages);

      // ── 4. Directory profiles ─────────────────────────────────────────────
      // Clutch and Crunchbase list clients and project detail the firm's own
      // marketing pages often leave out.
      const directories = hits
        .filter((h) => DIRECTORY_WORTH_READING.test(h.url))
        .slice(0, 3);
      let dirPages = 0;
      for (const d of directories) {
        if (outOfTime()) break;
        const page = await fetchOne(d.url);
        if (!page) continue;
        dirPages++;
        combined += ' ' + page.text.slice(0, 15_000);
      }
      if (dirPages) sources.push('directory:' + dirPages);

      // ── 5. News ───────────────────────────────────────────────────────────
      const news = await searchNews(String(f.firm_name));
      if (news.length) {
        sources.push('news:' + news.length);
        combined += ' ' + news.map((n) => n.title).join('. ');
      }

      // Anything at all beyond the firm's own site still counts as researched:
      // a firm with a dead website but a full Clutch profile is workable.
      const haveEvidence = reachedAny || dirPages > 0 || !!apollo || news.length > 0;

      if (!haveEvidence) {
        // Nothing anywhere: no site, no directory profile, no Apollo record,
        // no news. Record what was tried so a human is not left guessing.
        await supabase.from('bd_firms').update({
          researched_at: new Date().toISOString(),
          website: discovered ?? stored ?? null,
          notes: `research: nothing found — site ${domain} (${domainSource}) unreachable, `
            + `no Apollo record, no directory profile, no news`,
          updated_at: new Date().toISOString(),
        }).eq('id', f.id);
        results.push({ firm: f.firm_name, status: 'nothing-found', tried: domain });
        continue;
      }

      const facts = extractFacts(combined, f.firm_name);
      const flags = disqualifierFlags(combined);
      if (redirectedTo) (flags.acquired_dead ||= []).push(`redirects to ${redirectedTo}`);

      // Domain anchor: does their CLIENT and INDUSTRY language match a type he
      // has actually shipped for? Checked against the extracted facts, never
      // the raw page — a careers page saying "we are recruiting" would
      // otherwise promote the grade and select the strongest angle on a phrase
      // that has nothing to do with their clients.
      const anchorHay = [...facts.clients, ...facts.verticals, ...facts.cases].join(' ').toLowerCase();
      const anchor = CONFIG.domain_anchors.find((a) => anchorHay.includes(a)) || null;

      await supabase.from('bd_firms').update({
        research_facts: {
          ...facts,
          apollo,                    // firmographics: headcount, tech, LinkedIn URL
          news,                      // items naming the firm verbatim
          sources,                   // which of the five actually answered
          fetched_from: domain,
          domain_source: domainSource,
          chars: combined.length,
        },
        disqualifier_flags: Object.keys(flags).length ? flags : null,
        has_domain_anchor: !!anchor,
        // Only persist a domain we actually confirmed — writing a guess back
        // would make the next run treat it as known-good.
        website: domainSource === 'guessed' && !reachedAny ? null : domain,
        researched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', f.id);

      results.push({
        firm: f.firm_name,
        status: 'researched',
        domain_source: domainSource,
        sources,
        news: news.length,
        apollo: apollo ? (apollo.headcount ?? 'yes') : null,
        clients: facts.clients.length,
        stack: facts.stack.length,
        team: facts.team.length,
        verticals: facts.verticals.length,
        domain_anchor: anchor,
        flags: Object.keys(flags),
      });
    }

    // Self-continuation: if the deadline cut the batch short and there is still
    // work queued, kick off another run rather than waiting for the next cron.
    // Fire-and-forget on purpose — this response must not block on it.
    let continued = false;
    if (ranOutOfTime && !body.no_continue && !body.firm_ids?.length) {
      const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/bd-research`;
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit }),
      }).catch((e) => console.error('[bd-research] continuation failed:', String(e)));
      continued = true;
    }

    console.log(`[bd-research] ${results.length} firms${continued ? ' (continuing)' : ''}`);
    return ok({ success: true, researched: results.length, continued, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[bd-research] fatal:', msg);
    return err(500, msg);
  }
});
