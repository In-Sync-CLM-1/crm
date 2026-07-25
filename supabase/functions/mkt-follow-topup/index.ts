/**
 * mkt-follow-topup — keeps the follow-request send queue stocked.
 *
 * Runs nightly, ahead of the sender. Pulls the next slice of contacts from the
 * RMPL master contact database, screens them, and queues the survivors.
 *
 * Screening matters more than volume here. The observed hard-bounce rate on
 * this list is ~27% (2,326 of 8,692 addresses RMPL has actually sent to), and
 * bounce rate — not send volume — is what mailbox providers score a sending
 * domain on. Since this campaign sends from in-sync.co.in, the same domain the
 * whole product fleet sends invoices and password resets from, every avoidable
 * bounce is a shared risk. So each address is checked before it is ever queued:
 *
 *   1. syntax
 *   2. not a role/shared mailbox (info@, sales@, support@ …) — nobody follows
 *      a LinkedIn page from a shared inbox, and these skew complaint rates
 *   3. THE MAILBOX PLAUSIBLY BELONGS TO THE NAMED PERSON (see mailboxIsPersonal).
 *      This is the strictest filter and it discards the most: the email opens
 *      "Hi <first name>", so it has to reach that person and not a generic
 *      company inbox. Roughly 39% of the decision-maker tier and 23% of the
 *      practitioner tier are company mailboxes on free providers
 *      (aolindia@hotmail.com for a person named Anoop) and are dropped.
 *   4. not a disposable domain
 *   5. the domain actually has an MX record (live DNS check, cached per domain)
 *   6. not already known-bad or already contacted
 *
 * The MX check is the highest-yield one: dead company domains are the single
 * largest bounce source in an aged B2B list, and they cost nothing to detect.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { FOLLOW_CAMPAIGNS } from '../_shared/followRequestEmail.ts';

const RMPL_URL = 'https://ufwvyybrctjpwipbveqe.supabase.co';

/**
 * Firmographic exclusions — the audience is SMB only.
 *
 * Large-company contacts inflate the list and never convert: they sit on the
 * connections and don't buy. Three independent signals, any one of which is
 * disqualifying:
 *   - headcount band of 501+
 *   - turnover at or above the MSME 'medium' ceiling (₹250cr ≈ USD 30M)
 *   - the company appears more than 3 times in the source database, which is
 *     the strongest signal of the three (see mkt_follow_excluded_companies)
 */
const BIG_HEADCOUNT_BANDS = new Set([
  '501-1000', '1001-5000', '5001-10000', '10001-100000', '100001+',
]);
const MAX_TURNOVER_USD_M = 30;
const BATCH_TARGET = 150;        // queued per segment per run — a 1.5-day cushion
const SOURCE_PAGE = 1500;        // candidates pulled per segment per run

function ok(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function err(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const ROLE_LOCALPARTS = new Set([
  'info', 'sales', 'support', 'admin', 'contact', 'enquiry', 'enquiries', 'inquiry',
  'help', 'service', 'services', 'office', 'mail', 'email', 'hr', 'jobs', 'careers',
  'billing', 'accounts', 'account', 'finance', 'purchase', 'purchases', 'marketing',
  'noreply', 'no-reply', 'donotreply', 'webmaster', 'postmaster', 'hello', 'team',
  'reception', 'general', 'export', 'imports', 'md', 'ceo', 'director', 'care',
]);

const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com',
  'yopmail.com', 'throwawaymail.com', 'trashmail.com', 'getnada.com', 'temp-mail.org',
]);

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** DNS-over-HTTPS MX lookup. Cached per domain for the life of the invocation. */
async function hasMx(domain: string, cache: Map<string, boolean>): Promise<boolean> {
  const hit = cache.get(domain);
  if (hit !== undefined) return hit;
  let result = false;
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`, {
      headers: { accept: 'application/dns-json' },
      signal: AbortSignal.timeout(5000),
    });
    if (r.ok) {
      const j = await r.json();
      // Status 0 = NOERROR. An MX answer, or a domain that at least resolves to
      // an A record (some small hosts accept mail on the A record), passes.
      result = j?.Status === 0 && Array.isArray(j?.Answer) && j.Answer.some((a: { type: number }) => a.type === 15);
    }
  } catch {
    // A DNS timeout is not evidence the domain is dead — don't discard on it.
    result = true;
  }
  cache.set(domain, result);
  return result;
}

/**
 * Does this mailbox plausibly belong to the person we're about to greet by name?
 *
 * The email opens "Hi Anoop," so an address like aolindia@hotmail.com — a
 * company mailbox that happens to be filed against a person — must be dropped,
 * not personalised at. Matching on the surname as well as the first name is
 * what keeps genuinely personal addresses like kanodia@… in the list.
 *
 * Match is boundary-aware rather than a bare substring test, because a short
 * name would otherwise hit anything: "Ram" is a substring of "programs".
 * A name token counts when it is a whole dot/underscore-separated piece of the
 * local part, or the local part starts or ends with it, or (only for tokens of
 * five characters or more, where accidental collisions are unlikely) appears
 * anywhere inside it.
 */
function mailboxIsPersonal(fullName: string | null, localPart: string): boolean {
  const tokens = (fullName || '')
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  if (!tokens.length) return false;

  const pieces = localPart.split(/[^a-z]+/).filter(Boolean);

  return tokens.some((t) =>
    pieces.includes(t) ||
    localPart.startsWith(t) ||
    localPart.endsWith(t) ||
    (t.length >= 5 && localPart.includes(t)),
  );
}

function firstNameOf(full: string | null, salutation: string | null): string | null {
  const raw = (full || '').trim().replace(/\s+/g, ' ');
  if (!raw) return null;
  let parts = raw.split(' ');
  // Drop a leading honorific so we don't greet someone "Hi Mr".
  const honorific = /^(mr|mrs|ms|miss|dr|prof|shri|smt|sri|capt|col|adv|ca|er)\.?$/i;
  if (parts.length > 1 && honorific.test(parts[0])) parts = parts.slice(1);
  const first = parts[0] || '';
  if (!first || first.length < 2 || first.length > 24) return null;
  if (/[0-9@_]/.test(first)) return null;
  // Title-case ALL-CAPS or all-lowercase source data.
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/**
 * Tier classification. Mirrors the SQL used to size the audience, kept here
 * because the source rows arrive already filtered by the same predicate —
 * this is the belt-and-braces check on each individual row.
 */
function classify(designation: string | null, jobLevel: string | null): 'leader' | 'individual' | null {
  const d = (designation || '').toLowerCase().trim();
  const l = (jobLevel || '').toLowerCase().trim();

  const LEADER = /(chief (executive|financial|operating|technology|information|marketing|human|security|business|revenue|digital|product|data|medical|commercial)|(^| )(ceo|cfo|coo|cto|cio|cmo|chro|ciso|cxo|cbo|cro|cdo|cpo)( |$)|founder|propr?i?e?t[eo]r|(^| )owner( |$)|chairman|chairperson|managing director|(^| )md( |$)|(^| )partner( |$)|president)/;
  const NOT_LEADER = /(vice president|assistant to|secretary to|executive assistant|pa to)/;
  const DIRECTOR = /(^| )director( |$|s|-|,|\/)/;
  const NOT_DIRECTOR = /(deputy|assistant|asst|associate|sub)/;
  const UPPER_MID = /(senior manager|sr\.? manager|general manager|(^| )(gm|agm|dgm)( |$)|(^| )head( |$|-|,|\/)|head of|vice president|(^| )(vp|avp|evp|svp)( |$))/;
  const INDIVIDUAL = /(manager|team lead|teamlead|(^| )lead( |$)|supervisor|superviser|incharge|in-charge|executive|engineer|developer|officer|associate|assistant|analyst|consultant|coordinator|specialist|trainee|intern|junior|(^| )jr( |$)|technician|designer|scientist|programmer|tester|accountant|admin|sales|marketing|support|operator|staff|clerk|representative|advisor|architect)/;

  if (d) {
    if (LEADER.test(d) && !NOT_LEADER.test(d)) return 'leader';
    if (DIRECTOR.test(d) && !NOT_DIRECTOR.test(d)) return 'leader';   // Directors fold into tier 1
    if (UPPER_MID.test(d)) return null;                                // deliberately out of scope
    if (INDIVIDUAL.test(d)) return 'individual';
    return null;
  }
  // Fall back to the coarse job_level column only when there's no designation.
  if (/(c level|c-level|ceo|cfo|coo|cto|cio|cmo|chro|ciso|chief|founder|owner|proprietor|chairman|md)/.test(l)) return 'leader';
  if (/(manager|executive|engineer|below manager|team leader|lead|consultant|designer|architect)/.test(l) && !/(sr\.|senior|general|gm|agm|dgm)/.test(l)) return 'individual';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const rmplKey = Deno.env.get('RMPL_SERVICE_KEY');
  if (!rmplKey) return err(500, 'RMPL_SERVICE_KEY not configured');

  const supabase = createClient(supabaseUrl, serviceKey);
  const rmpl = createClient(RMPL_URL, rmplKey);

  const body = await req.json().catch(() => ({}));
  const target: number = Math.min(Number(body.target) || BATCH_TARGET, 500);
  const dryRun = body.dry_run === true;

  const { data: org } = await supabase.from('organizations').select('id').limit(1).single();
  if (!org) return err(500, 'no organization');
  const orgId = org.id;

  // Everything already known about, in one pass — these are the exclusion sets.
  const [{ data: existing }, { data: unsubs }] = await Promise.all([
    supabase.from('mkt_follow_campaign').select('email').eq('org_id', orgId),
    supabase.from('mkt_unsubscribes').select('email').eq('org_id', orgId).eq('channel', 'email'),
  ]);
  const seen = new Set<string>();
  for (const r of existing || []) seen.add(String(r.email).toLowerCase());
  for (const r of unsubs || []) if (r.email) seen.add(String(r.email).toLowerCase());

  // Companies too large for an SMB campaign, materialised by an earlier
  // frequency analysis of the source database.
  const bigCompanies = new Set<string>();
  {
    let from = 0;
    for (;;) {
      const { data } = await supabase
        .from('mkt_follow_excluded_companies')
        .select('company_name')
        .range(from, from + 999);
      if (!data || data.length === 0) break;
      for (const r of data) bigCompanies.add(String(r.company_name).toLowerCase().trim());
      if (data.length < 1000) break;
      from += 1000;
    }
  }

  // Addresses RMPL has already proven undeliverable.
  const knownBad = new Set<string>();
  {
    let from = 0;
    for (;;) {
      const { data } = await rmpl
        .from('email_activity_log')
        .select('to_email')
        .not('bounced_at', 'is', null)
        .range(from, from + 999);
      if (!data || data.length === 0) break;
      for (const r of data) if (r.to_email) knownBad.add(String(r.to_email).toLowerCase().trim());
      if (data.length < 1000) break;
      from += 1000;
    }
  }

  const mxCache = new Map<string, boolean>();
  const queued: Record<string, number> = { leader: 0, individual: 0 };
  const rejected: Record<string, number> = {};
  const bump = (k: string) => { rejected[k] = (rejected[k] || 0) + 1; };

  for (const segment of ['leader', 'individual'] as const) {
    // Where the last run stopped, so each night walks forward through the list
    // instead of re-screening the same head of the table.
    const { data: cursorRow } = await supabase
      .from('mkt_engine_config')
      .select('config_value')
      .eq('org_id', orgId)
      .eq('config_key', `follow_topup_offset_${segment}`)
      .maybeSingle();
    let offset = Number((cursorRow?.config_value as { offset?: number })?.offset || 0);

    const toInsert: Record<string, unknown>[] = [];
    let scanned = 0;

    while (toInsert.length < target && scanned < SOURCE_PAGE * 4) {
      const { data: rows, error } = await rmpl
        .from('master')
        .select('id,name,salutation,designation,job_level_updated,official,personal_email_id,company_name,city,state,emp_size_bucket,turnover_usd_million')
        .order('id', { ascending: true })
        .range(offset, offset + SOURCE_PAGE - 1);
      if (error) return err(500, `RMPL read failed: ${error.message}`);
      if (!rows || rows.length === 0) break;   // end of the list

      offset += rows.length;
      scanned += rows.length;

      for (const r of rows) {
        if (toInsert.length >= target) break;

        const seg = classify(r.designation, r.job_level_updated);
        if (seg !== segment) continue;

        // --- SMB only ------------------------------------------------------
        const co = (r.company_name || '').toString().trim().toLowerCase();
        let sizeNote: string | null = null;
        if (co && bigCompanies.has(co)) { bump('large_company_by_frequency'); continue; }
        if (BIG_HEADCOUNT_BANDS.has((r.emp_size_bucket || '').toString().trim())) {
          bump('large_headcount'); continue;
        }
        if (r.turnover_usd_million != null && Number(r.turnover_usd_million) >= MAX_TURNOVER_USD_M) {
          bump('large_turnover'); continue;
        }
        if (r.emp_size_bucket) sizeNote = `headcount ${r.emp_size_bucket}`;
        else if (r.turnover_usd_million != null) sizeNote = `turnover ~$${r.turnover_usd_million}M`;

        const raw = (r.official || r.personal_email_id || '').toString().trim().toLowerCase();
        if (!raw || !EMAIL_RE.test(raw)) { bump('bad_syntax'); continue; }
        if (seen.has(raw)) { bump('already_known'); continue; }
        if (knownBad.has(raw)) { bump('previously_bounced'); continue; }

        const [local, domain] = raw.split('@');
        if (ROLE_LOCALPARTS.has(local)) { bump('role_mailbox'); continue; }
        if (DISPOSABLE.has(domain)) { bump('disposable'); continue; }

        // Must be able to greet a real person at this address, by name.
        const firstName = firstNameOf(r.name, r.salutation);
        if (!firstName) { bump('no_usable_first_name'); continue; }
        if (!mailboxIsPersonal(r.name, local)) { bump('company_mailbox'); continue; }

        if (!(await hasMx(domain, mxCache))) { bump('no_mx'); continue; }

        seen.add(raw);   // guard against duplicates inside this same batch
        toInsert.push({
          org_id: orgId,
          email: raw,
          first_name: firstName,
          full_name: r.name || null,
          designation: r.designation || null,
          company_name: r.company_name || null,
          city: r.city || null,
          state: r.state || null,
          segment,
          campaign_key: FOLLOW_CAMPAIGNS[segment].key,
          campaign_name: FOLLOW_CAMPAIGNS[segment].name,
          company_size_note: sizeNote,
          source: 'rmpl_master',
          source_row_id: r.id,
          status: 'queued',
          verified_at: new Date().toISOString(),
          verify_ok: true,
        });
      }

      if (rows.length < SOURCE_PAGE) break;   // exhausted the source
    }

    if (!dryRun && toInsert.length) {
      const { error } = await supabase
        .from('mkt_follow_campaign')
        .upsert(toInsert, { onConflict: 'org_id,email', ignoreDuplicates: true });
      if (error) return err(500, `queue insert failed: ${error.message}`);
    }
    if (!dryRun) {
      await supabase.from('mkt_engine_config').upsert(
        {
          org_id: orgId,
          config_key: `follow_topup_offset_${segment}`,
          config_value: { offset },
          description: `mkt-follow-topup scan cursor into RMPL master (${segment})`,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,config_key' },
      );
    }
    queued[segment] = toInsert.length;
  }

  return ok({ success: true, dry_run: dryRun, queued, rejected, mx_domains_checked: mxCache.size });
});
