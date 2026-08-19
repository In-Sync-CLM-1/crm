/**
 * BD outreach pipeline — shared config and logic.
 *
 * Every threshold the spec exposes lives in CONFIG. Change a number here,
 * re-run bd-grade, and the whole list re-grades consistently — this is the
 * port of grade.py's CONFIG block, kept deliberately in one place so the
 * grading stays reproducible rather than scattered across call sites.
 */

export const BD_ORG_ID = '65e22e43-f23d-4c0a-9d84-2eba65ad0e12';

export const CONFIG = {
  // --- hard gates: fail any of these and the firm is out ---
  min_headcount: 10,        // below this: no delivery bench to join
  max_headcount: 249,       // above this: procurement, not a founder decision
  require_us_hq: true,      // "Serves United States" is not a US HQ
  require_reviews: true,
  min_bill_rate: 100,       // at a 40-60% subcontractor share, below this
                            // cannot reach a $50/hr floor

  // --- grading thresholds (% revenue in matching service lines) ---
  fit_A: 40,
  fit_B: 20,

  // --- signals that promote a firm one grade ---
  promote_on_crm: true,     // his competence is already their revenue line
  promote_on_staffaug: true,// they already buy outside capacity
  promote_on_domain: true,  // client type matches his record

  // Client types he has actually shipped for. A domain anchor outranks the
  // fit score — it is the strongest signal in the whole model.
  domain_anchors: [
    'marketing agency', 'events', 'staffing', 'recruit', 'workforce',
    'crew', 'field service', 'lending', 'nbfc', 'loan', 'insurance',
    'financial services', 'distribution', 'logistics',
  ],

  fit_services: [
    'CRM Consulting and SI', 'ERP Consulting and SI',
    'Enterprise App Modernization', 'Custom Software Development',
    'IT Strategy Consulting', 'Application Management & Support',
    'AI Consulting', 'AI Development', 'Generative AI', 'AI Agents',
    'IT Staff Augmentation', 'BI & Big Data Consulting & SI',
    'API Development', 'Other IT Consulting and SI',
    'Robotics Process Automation', 'Cloud Consulting & SI',
  ],

  exclude_marketing: [
    'Pay Per Click', 'Search Engine Optimization', 'Social Media Marketing',
    'Branding', 'Content Marketing', 'Advertising', 'Ecommerce Marketing',
    'Performance Marketing', 'Media Planning & Buying', 'Public Relations',
    'Demand Generation Marketing', 'Marketing Strategy', 'Digital Strategy',
    'Web Design', 'Graphic Design', 'Market Research',
    'Mobile & App Marketing', 'Sales Outsourcing', 'Video Production',
  ],
  exclude_msp: ['IT Managed Services', 'Cybersecurity', 'Virtual CIO Services'],
  marketing_cutoff: 50,     // marketing % at/above this with fit below fit_B = agency
  msp_cutoff: 40,           // infrastructure shop, not systems
};

/**
 * Disqualifier patterns. These FLAG for manual review and never auto-drop —
 * six of fifteen batch-1 picks failed here after clearing every automated
 * filter, which makes this the highest-value step in the pipeline and exactly
 * the one that must stay human.
 */
export const DISQUALIFIERS: Record<string, RegExp[]> = {
  // competitor with in-house offshore capacity — caught Linnify, WiserBrand
  offshore_delivery: [
    /\b(our\s+)?(team|office|hub|centre|center)\s+in\s+(Ukraine|Poland|Romania|Argentina|Uruguay|Colombia|Mexico|Vietnam|Philippines|Belarus|Moldova)/i,
    /\bnearshore\b/i, /\bLATAM\b/i, /\bR&D\s+(hub|centre|center)\b/i,
  ],
  // their differentiator is the opposite of the offer — caught Def Method, Eureka
  onshore_positioning: [
    /100%\s*(US|U\.S\.|American|Austin|onshore|domestic)/i,
    /\ball\s+onshore\b/i, /\bno\s+offshore\b/i, /\bcheap\s+substitutes\b/i,
    /\bUS-based\s+(team|engineers|developers)\b/i,
  ],
  // certification is their edge; offshore subcontracting undermines it
  diversity_certified: [
    /\b(MBE|WBE|DBE|WOSB|8\(a\))\b/, /\bwomen[- ]owned\b/i, /\bminority[- ]owned\b/i,
  ],
  // not operations systems — caught TangoCode
  domain_mismatch: [
    /\bMarTech\b/i, /\badtech\b/i, /\bconsumer apps?\b/i,
    /\be-?commerce storefronts?\b/i, /\binfluencer platforms?\b/i,
  ],
  // likeliest reply is a partnership pitch — caught Metrotechs
  too_small_to_pay: [/\bsolo founder\b/i, /\bone-person\b/i, /\bfounded in 202[5-9]\b/i],
  // caught Utegration, Headspring, Woodridge, Nuvem
  acquired_dead: [/\bpart of\s+[A-Z]/, /\bacquired by\b/i, /\bnow (part of|a division of)\b/i],
};

/** Clutch re-serves sponsored listings across pages — dedupe on this, not the printed name. */
export const nameKey = (s: string): string =>
  String(s || '')
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co|company|group|technologies|technology)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export interface FirmRow {
  id: string;
  firm_name: string;
  headcount_band: string | null;
  bill_rate_band: string | null;
  fit_score: number | null;
  ai_services_pct: number | null;
  has_crm_erp_line: boolean;
  has_staff_aug: boolean;
  has_domain_anchor: boolean;
  other_services: string | null;
  research_facts: Record<string, unknown> | null;
}

const bandLow = (band: string | null): number | null => {
  const m = String(band || '').match(/(\d[\d,]*)/);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
};

/** Percentage of revenue in a named list of service lines, from the "70% X, 20% Y" string. */
export const servicePct = (services: string | null, names: string[]): number => {
  if (!services) return 0;
  let total = 0;
  for (const part of String(services).split(/,(?=\s*\d)/)) {
    const m = part.match(/(\d+(?:\.\d+)?)\s*%?\s*(.+)/);
    if (!m) continue;
    const pct = parseFloat(m[1]);
    const label = m[2].trim().toLowerCase();
    if (names.some((n) => label.includes(n.toLowerCase()) || n.toLowerCase().includes(label))) total += pct;
  }
  return total;
};

export interface GradeResult {
  grade: 'A' | 'B' | 'C' | 'X' | '?';
  reasons: string[];
  promoted_by: string | null;
}

/**
 * Grade one firm. Mirrors grade.py exactly: hard gates first, then the fit
 * bands, then at most one promotion.
 *
 * Time zone is deliberately NOT an input — Amit takes at most one full-time or
 * two part-time assignments and resets his hours, so TZ is information only.
 */
export function gradeFirm(f: FirmRow): GradeResult {
  const reasons: string[] = [];

  const rateLow = bandLow(f.bill_rate_band);
  if (f.bill_rate_band && !/\$/.test(f.bill_rate_band)) {
    return { grade: '?', reasons: ['bill rate undisclosed — verify, then regrade'], promoted_by: null };
  }
  if (!f.bill_rate_band) return { grade: '?', reasons: ['no bill rate on file'], promoted_by: null };
  if (rateLow !== null && rateLow < CONFIG.min_bill_rate) {
    return { grade: 'X', reasons: [`bills ${f.bill_rate_band} — cannot fund a $50/hr floor`], promoted_by: null };
  }

  const headLow = bandLow(f.headcount_band);
  if (headLow !== null && headLow < CONFIG.min_headcount) {
    return { grade: 'X', reasons: [`${f.headcount_band} — no delivery bench to join`], promoted_by: null };
  }
  if (headLow !== null && headLow > CONFIG.max_headcount) {
    return { grade: 'X', reasons: [`${f.headcount_band} — procurement, not a founder decision`], promoted_by: null };
  }

  const marketingPct = servicePct(f.other_services, CONFIG.exclude_marketing);
  const mspPct = servicePct(f.other_services, CONFIG.exclude_msp);
  const fit = f.fit_score !== null ? (f.fit_score <= 1 ? f.fit_score * 100 : f.fit_score) : servicePct(f.other_services, CONFIG.fit_services);

  if (marketingPct >= CONFIG.marketing_cutoff && fit < CONFIG.fit_B) {
    return { grade: 'X', reasons: [`${marketingPct}% marketing services — agency, not a systems shop`], promoted_by: null };
  }
  if (mspPct >= CONFIG.msp_cutoff) {
    return { grade: 'X', reasons: [`${mspPct}% managed services — infrastructure, not systems`], promoted_by: null };
  }

  let grade: GradeResult['grade'] = fit >= CONFIG.fit_A ? 'A' : fit >= CONFIG.fit_B ? 'B' : 'C';
  reasons.push(`fit ${Math.round(fit)}% in matching service lines`);

  // At most one promotion, strongest signal first.
  let promoted: string | null = null;
  if (grade !== 'A') {
    if (CONFIG.promote_on_domain && f.has_domain_anchor) promoted = 'domain anchor in the client list';
    else if (CONFIG.promote_on_crm && f.has_crm_erp_line) promoted = 'declared CRM/ERP line';
    else if (CONFIG.promote_on_staffaug && f.has_staff_aug) promoted = 'declared staff-augmentation line';
    if (promoted) {
      grade = grade === 'B' ? 'A' : 'B';
      reasons.push(`promoted one grade: ${promoted}`);
    }
  }

  return { grade, reasons, promoted_by: promoted };
}

/**
 * Scan research text for disqualifier patterns. Returns flags — never a verdict.
 * Each hit carries a window of surrounding text, not just the bare matched
 * phrase — "acquired by" on its own (the old behavior) told a reviewer a red
 * flag fired but never who acquired the firm, forcing them to go re-research
 * it themselves before they could act on the flag at all.
 */
export function disqualifierFlags(text: string): Record<string, string[]> {
  const hits: Record<string, string[]> = {};
  for (const [name, patterns] of Object.entries(DISQUALIFIERS)) {
    for (const re of patterns) {
      const m = text.match(re);
      if (!m) continue;
      if (m.index == null) { (hits[name] ||= []).push(m[0]); continue; }
      const start = Math.max(0, m.index - 60);
      const end = Math.min(text.length, m.index + m[0].length + 80);
      let snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
      if (start > 0) snippet = `…${snippet}`;
      if (end < text.length) snippet = `${snippet}…`;
      (hits[name] ||= []).push(snippet);
    }
  }
  return hits;
}

// ── Angle selection ──────────────────────────────────────────────────────────
// v4 outranks the rest whenever it applies: "I built this exact thing for a
// client like yours" beats any argument from category.
export const ANGLES = {
  1: { key: 'crm_erp', line: 'your competence is already their revenue line' },
  2: { key: 'staff_aug', line: "you already buy outside capacity — I'll be direct" },
  3: { key: 'ai_gap', line: 'no AI line on your site — deliberate, or unanswered?' },
  4: { key: 'domain', line: 'I built this exact thing for a client like yours' },
} as const;

export function pickAngle(f: FirmRow): { version: 1 | 2 | 3 | 4; why: string } {
  if (f.has_domain_anchor) return { version: 4, why: 'domain anchor matches his record — strongest angle, outranks the others' };
  if (f.has_crm_erp_line) return { version: 1, why: 'declared CRM/ERP line' };
  if (f.has_staff_aug) return { version: 2, why: 'declared staff-augmentation line' };
  const fit = f.fit_score !== null ? (f.fit_score <= 1 ? f.fit_score * 100 : f.fit_score) : 0;
  if ((f.ai_services_pct ?? 0) === 0 && fit >= CONFIG.fit_A) return { version: 3, why: '0% AI services with fit ≥ 40%' };
  return { version: 2, why: 'no stronger signal — staff-aug framing is the safest default' };
}

// ── Proof selection ──────────────────────────────────────────────────────────
// Match the artifact to their work. Never send the same number to everyone.
export const PROOFS = {
  ats: {
    text: 'an ATS I built runs about 92,000 recruits across 600 clients and 2,500 sites, operated by 47 users',
    matches: ['staffing', 'recruit', 'workforce', 'crew', 'talent', 'hr'],
    why: 'high-volume records operated by a small team',
  },
  redefine: {
    text: 'a 140-person agency runs CRM, projects, expenses and payables on one platform I built — revenue per head went ₹17.1L to ₹24.9L',
    matches: ['marketing', 'agency', 'events', 'advertising', 'media'],
    why: 'multi-module operations for an agency',
  },
  capital_india: {
    text: 'an AI-triaged grievance desk handling 6,215 complaints, 76% resolved at self-serve intake',
    matches: ['ai', 'intake', 'triage', 'support', 'service desk', 'financial'],
    why: 'AI workflow with intake and triage',
  },
  los: {
    text: 'a full loan origination system — lead capture through KYC, credit, underwriting, disbursal and collections, with AI document parsing and fraud detection',
    matches: ['lending', 'loan', 'nbfc', 'insurance', 'underwriting', 'bank', 'fintech'],
    why: 'structurally an underwriting flow',
  },
  excel: {
    text: 'an Excel parsing layer where the AI accepts whatever format users already keep, instead of asking them to change',
    matches: ['legacy', 'as/400', 'vb6', 'foxpro', 'delphi', 'migration', 'modernization'],
    why: 'the legacy constraint IS the job',
  },
  routing: {
    text: '11 live AI features on primary/fallback model routing across Groq and Claude — one of them killed when it did not earn its place',
    matches: ['ai development', 'generative ai', 'ai agents', 'machine learning', 'llm'],
    why: 'AI-native shops recognise the failure modes',
  },
} as const;

export type ProofKey = keyof typeof PROOFS;

export function pickProof(f: FirmRow, researchText: string): { key: ProofKey; why: string } {
  const haystack = `${f.other_services || ''} ${researchText}`.toLowerCase();
  let best: { key: ProofKey; score: number } | null = null;
  for (const [key, proof] of Object.entries(PROOFS) as [ProofKey, typeof PROOFS[ProofKey]][]) {
    const score = proof.matches.filter((m) => haystack.includes(m)).length;
    if (score > 0 && (!best || score > best.score)) best = { key, score };
  }
  const key = best?.key ?? 'ats';
  return { key, why: PROOFS[key].why };
}

// ── Contact selection ────────────────────────────────────────────────────────
// Ordered by who feels the capacity gap. HR screens for work authorisation
// before anyone reads the record; sales turns him into a prospect.
export const TITLE_PRIORITY: [RegExp, number, string][] = [
  [/\b(director|vp|head|practice lead).{0,20}(delivery|consulting|services|professional services)\b/i, 1, 'delivery lead — feels the capacity gap directly'],
  [/\b(cto|chief architect|vp engineering|head of engineering)\b/i, 2, 'owns the bench — reads the 92k-on-47-users ratio as architecture'],
  [/\b(president|coo|managing partner|managing director)\b/i, 3, 'runs delivery day to day at this size'],
  [/\b(founder|ceo|owner|principal)\b/i, 4, 'at this size they decide personally'],
];

export const NEVER_CONTACT = /\b(hr|human resources|talent|recruit|people ops|sales|business development|bd|cro|marketing|cfo|finance|client success|account manage)/i;

export function scoreContact(title: string | null): { rank: number; why: string } | null {
  const t = String(title || '');
  if (!t) return { rank: 9, why: 'no title on file' };
  if (NEVER_CONTACT.test(t)) return null;   // screens him out before anyone reads the record
  for (const [re, rank, why] of TITLE_PRIORITY) if (re.test(t)) return { rank, why };
  return { rank: 8, why: 'title outside the priority list but not excluded' };
}

// ── Send windows ─────────────────────────────────────────────────────────────
// 08:00–11:00 recipient local time, Tuesday/Wednesday/Thursday only.
// August: ET = UTC-4, CT = UTC-5.
export const TZ_OFFSET: Record<string, number> = { ET: -4, CT: -5, MT: -6, PT: -7 };

export function isSendDay(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 2 || day === 3 || day === 4;
}

/** Next valid send slot for a firm, in UTC, honouring its local 8–11am window. */
export function nextSendSlot(tz: string, after: Date, slotIndex = 0): Date {
  const offset = TZ_OFFSET[tz] ?? -4;
  const d = new Date(after);
  for (let i = 0; i < 21; i++) {
    const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + i));
    if (!isSendDay(day)) continue;
    // 08:00 local + 35 min per slot keeps five sends inside the 3-hour window
    // and well clear of the 5-minute scheduler tick that would otherwise
    // collapse tighter gaps into a single burst.
    const utcHour = 8 - offset;
    const slot = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), utcHour, slotIndex * 35));
    if (slot > after) return slot;
  }
  return new Date(after.getTime() + 86400000);
}
