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
 *   POST { limit: 25 }        research the next N unresearched A/B firms
 *   POST { firm_ids: [...] }  research specific firms
 *   POST { no_continue: true } do not self-continue after the deadline
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
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const ok = (d: unknown) => new Response(JSON.stringify(d), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const err = (s: number, m: string) => new Response(JSON.stringify({ error: m }), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const PATHS = ['', '/case-studies', '/work', '/portfolio', '/about', '/services', '/clients', '/team'];

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
    const limit = Math.min(Number(body.limit) || 25, 60);
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
      const domain = (f as { website?: string }).website
        || `https://${String(f.firm_name).toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;

      let combined = '';
      let reachedAny = false;
      let redirectedTo: string | null = null;

      const base = domain.replace(/\/$/, '');
      const pages = await fetchAll(PATHS.map((p) => base + p), 3);
      for (const page of pages) {
        if (!page) continue;
        reachedAny = true;
        combined += ' ' + page.text.slice(0, 20_000);
        // A redirect landing on a different company name is an acquisition.
        try {
          const host = new URL(page.finalUrl).hostname.replace(/^www\./, '');
          const expected = new URL(domain).hostname.replace(/^www\./, '');
          if (host !== expected) redirectedTo = host;
        } catch { /* malformed URL — not a redirect signal */ }
      }

      if (!reachedAny) {
        await supabase.from('bd_firms').update({
          researched_at: new Date().toISOString(),
          notes: `research: site unreachable at ${domain} — verify the URL`,
          updated_at: new Date().toISOString(),
        }).eq('id', f.id);
        results.push({ firm: f.firm_name, status: 'unreachable', tried: domain });
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
        research_facts: { ...facts, fetched_from: domain, chars: combined.length },
        disqualifier_flags: Object.keys(flags).length ? flags : null,
        has_domain_anchor: !!anchor,
        website: domain,
        researched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', f.id);

      results.push({
        firm: f.firm_name,
        status: 'researched',
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
