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
 *   POST { limit: 10 }        research the next N ungraded/unresearched firms
 *   POST { firm_ids: [...] }  research specific firms
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { BD_ORG_ID, disqualifierFlags, CONFIG } from '../_shared/bdPipeline.ts';

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

/** Case-study and client names as written. Titles come from heading-ish runs. */
function extractFacts(text: string, firmName: string) {
  const facts: Record<string, string[]> = { clients: [], cases: [], verticals: [], stack: [], team: [] };

  // Named platforms and partner tiers — these are the concrete things a first
  // line can be built on.
  const STACK = ['Salesforce', 'HubSpot', 'Dynamics 365', 'NetSuite', 'SAP', 'Oracle', 'ServiceNow',
    'Bullhorn', 'Zoho', 'Odoo', 'Shopify', 'Magento', 'AWS', 'Azure', 'Google Cloud', 'Snowflake',
    'Databricks', 'AS/400', 'VB6', 'FoxPro', 'Delphi', 'COBOL', 'Mulesoft', 'Boomi', 'Twilio'];
  for (const s of STACK) if (new RegExp(`\\b${s.replace(/[/.]/g, '\\$&')}\\b`, 'i').test(text)) facts.stack.push(s);

  const VERTICALS = ['healthcare', 'insurance', 'financial services', 'banking', 'lending', 'manufacturing',
    'logistics', 'distribution', 'retail', 'education', 'nonprofit', 'government', 'legal', 'real estate',
    'construction', 'energy', 'staffing', 'recruitment', 'hospitality', 'automotive', 'telecom'];
  for (const v of VERTICALS) if (new RegExp(`\\b${v}\\b`, 'i').test(text)) facts.verticals.push(v);

  // Leadership: "Firstname Lastname, Title" or "Firstname Lastname — Title"
  const teamRe = /\b([A-Z][a-z]+ [A-Z][a-z]+)\s*[,—–-]\s*((?:Chief|Co-?founder|Founder|CEO|CTO|COO|President|VP|Vice President|Director|Head|Partner|Principal)[A-Za-z &]*)/g;
  let m: RegExpExecArray | null;
  while ((m = teamRe.exec(text)) !== null && facts.team.length < 12) facts.team.push(`${m[1]} — ${m[2].trim()}`);

  // Client names: capitalised multiword runs near a client-ish cue word.
  const clientRe = /(?:clients?|customers?|partnered with|worked with|trusted by)[^.]{0,240}/gi;
  const stop = new Set(['We', 'Our', 'The', 'This', 'They', 'You', 'Your', 'And', 'For', 'With', firmName]);
  while ((m = clientRe.exec(text)) !== null && facts.clients.length < 20) {
    for (const cand of m[0].match(/\b[A-Z][A-Za-z0-9&.]*(?: [A-Z][A-Za-z0-9&.]*){0,3}\b/g) || []) {
      if (cand.length > 3 && !stop.has(cand.split(' ')[0]) && !facts.clients.includes(cand)) facts.clients.push(cand);
    }
  }

  // Case study titles as written.
  const caseRe = /(?:case study|success story)[:\s—–-]+([A-Z][^.|\n]{8,90})/gi;
  while ((m = caseRe.exec(text)) !== null && facts.cases.length < 12) facts.cases.push(m[1].trim());

  return facts;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit) || 10, 25);

    let query = supabase
      .from('bd_firms')
      .select('id, firm_name, city, state, website, other_services, research_facts, researched_at')
      .eq('org_id', BD_ORG_ID)
      .is('state_flag', null)
      .in('grade', ['A', 'B'])
      .order('grade', { ascending: true });

    if (body.firm_ids?.length) query = supabase
      .from('bd_firms')
      .select('id, firm_name, city, state, website, other_services, research_facts, researched_at')
      .eq('org_id', BD_ORG_ID)
      .in('id', body.firm_ids);
    else query = query.is('researched_at', null).limit(limit);

    const { data: firms, error } = await query;
    if (error) return err(500, error.message);
    if (!firms?.length) return ok({ skip: 'nothing to research' });

    const results: Record<string, unknown>[] = [];

    for (const f of firms) {
      const domain = (f as { website?: string }).website
        || `https://${String(f.firm_name).toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;

      let combined = '';
      let reachedAny = false;
      let redirectedTo: string | null = null;

      for (const p of PATHS) {
        const page = await fetchPage(domain.replace(/\/$/, '') + p);
        // Rate limit: 1 request / 2s, per the spec.
        await new Promise((r) => setTimeout(r, 2000));
        if (!page) continue;
        reachedAny = true;
        combined += ' ' + page.text.slice(0, 20_000);
        // A redirect landing on a different company name is an acquisition.
        const host = new URL(page.finalUrl).hostname.replace(/^www\./, '');
        const expected = new URL(domain).hostname.replace(/^www\./, '');
        if (host !== expected) redirectedTo = host;
      }

      if (!reachedAny) {
        await supabase.from('bd_firms').update({
          researched_at: new Date().toISOString(),
          notes: `research: site unreachable at ${domain} — verify the URL`,
          updated_at: new Date().toISOString(),
        }).eq('id', f.id);
        results.push({ firm: f.firm_name, status: 'unreachable' });
        continue;
      }

      const facts = extractFacts(combined, f.firm_name);
      const flags = disqualifierFlags(combined);
      if (redirectedTo) (flags.acquired_dead ||= []).push(`redirects to ${redirectedTo}`);

      // Domain anchor: does their client/vertical language match a type he has
      // actually shipped for? This outranks the fit score in grading.
      const hay = combined.toLowerCase();
      const anchor = CONFIG.domain_anchors.find((a) => hay.includes(a)) || null;

      await supabase.from('bd_firms').update({
        research_facts: { ...facts, fetched_from: domain, chars: combined.length },
        disqualifier_flags: Object.keys(flags).length ? flags : null,
        has_domain_anchor: !!anchor,
        researched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', f.id);

      results.push({
        firm: f.firm_name,
        status: 'researched',
        clients: facts.clients.length,
        stack: facts.stack.length,
        team: facts.team.length,
        domain_anchor: anchor,
        flags: Object.keys(flags),
      });
    }

    console.log(`[bd-research] ${results.length} firms`);
    return ok({ success: true, researched: results.length, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[bd-research] fatal:', msg);
    return err(500, msg);
  }
});
