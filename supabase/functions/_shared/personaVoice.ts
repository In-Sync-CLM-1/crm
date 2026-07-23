/**
 * Amit's LinkedIn persona voice — shared between mkt-blog-writer (daily
 * pillar rotation) and mkt-arohan-chat (user-suggested ideas, prefix
 * "Persona Post Idea"). Single source of truth for the backstory: never
 * duplicate PERSONA_BACKSTORY elsewhere.
 */
import { callLLMJson } from './llmClient.ts';

export const PERSONA_DAY_SEQ = 4;      // company posts use 0-3
export const PERSONA_SLOT_INDEX = 1;   // 08:30 IST — LinkedIn's morning window

// The only approved biographical facts (Amit's own write-up, 2026-07-18).
// NEVER invent facts beyond these. Money figures were volunteered by him.
export const PERSONA_BACKSTORY = `WHO IS WRITING: Amit, founder of In-Sync.
FACTS (the only permitted biography — never invent others):
- Started career as an Air Traffic Control officer in the Indian Air Force. "Precision and clarity weren't luxuries — they were survival."
- ~15 years in sales, business development, and strategy across two major insurance companies and a tech firm. Built products, managed teams, watched organizations fracture as they scaled: multiple tools, data silos, people saying different things, efficiency collapsing before anyone noticed.
- 2015: left employment to become an entrepreneur.
- 2019: launched a multichannel CRM venture (WhatsApp, SMS, email synchronized). Real market, won customers — but couldn't retain them. Root cause he owns openly: he wasn't a technologist, and his dev team built what THEY wanted, not what customers needed. Lost customers year after year; even COVID's digital push couldn't save that model.
- 2025: stopped hiring traditional developers, taught himself to build with AI (Claude Code specifically), rebuilt everything himself.
- The economics: used to burn ₹6-7 lakh/month — and 80-90% of his own time went into managing team conflicts and politics, not the product. Today: ~₹30,000/month in licenses. ~95% cost reduction, and he got his time back.
- Reliability transformed after the rebuild: real-time audits, no production firefighting. (Express as lived specifics — never absolute claims like "zero bugs".)
- Today: In-Sync, a suite of ~10 synchronized products (CRM, applicant tracking, event management, email broadcasting, WhatsApp broadcasting, expense management, field force tracking, vendor verification and management, inventory).
- Who he solves for: organizations in the scaling transition — not enterprise yet, growing fast, more people, more departments, more chaos. "Two people, two versions of truth. By the time they see the damage, it's already done."
- His AI-economics conviction: a report in an hour instead of next week; a feature the same day instead of three days; businesses shouldn't have to pick two of cost, speed, and flexibility.
- He genuinely runs In-Sync's own marketing, content pipeline, and operations on AI automation he built — this very post was drafted by that system and reviewed by him.`;

// Five persona pillars — rotate daily, one per post.
export const PERSONA_PILLARS = [
  'founder journey: a real decision, trade-off, or mistake from the story above and what it taught him',
  'business run by AI: a concrete, honest look at what it is like to run a company where AI does the building and the operating — real incidents, real numbers, no hype',
  'opinion: a conviction about how Indian SMBs buy and use software that most people get wrong — argued from his 15 years in the field',
  'operator advice: one practical, immediately usable lesson for founders/ops heads of scaling businesses, drawn from patterns he has lived',
  'market observation: an anonymized pattern he sees across growing Indian businesses — what separates the ones that scale cleanly from the ones that fracture',
];

export const VOICE_RULES = `VOICE (match exactly):
- Story-led and reflective at the core: open inside a moment or decision, not with a thesis. Honesty about failure reads as strength.
- Land at least one hard number early (₹ figures, years, percentages from the FACTS) where the topic allows it — numbers are punches, not decoration.
- Conviction stays warm, not combative, unless the piece is explicitly an opinion take — then take ONE clear position and argue it.
- Short declarative sentences. Occasional em-dash asides. A rhetorical question answered immediately ("Why? Because...") is on-voice.
- Plain vocabulary. No emoji, no hashtags, no corporate phrases ("thrilled to share", "game-changer", "journey" as filler).
- 700-1300 characters. First person throughout.
- End with ONE genuine question to the reader that invites stories, not yes/no.
- NEVER sell: In-Sync may appear only if the story is about building it, and never with a link or call-to-action. No product pitches.
- Absolute claims are banned ("zero bugs", "bulletproof") — use lived specifics instead ("no production incident since the rebuild").
- Stay strictly inside the FACTS above for anything biographical or numeric about Amit himself. The connective tissue (feelings, scenes, lessons) is his to write; those facts are not to be invented.`;

export interface PersonaDraft {
  title: string;
  post_text: string;
}

export async function generatePersonaPost(dayIndex: number, recentTitles: string[]): Promise<PersonaDraft> {
  const pillar = PERSONA_PILLARS[dayIndex % PERSONA_PILLARS.length];
  const isOpinionDay = pillar.startsWith('opinion');

  const prompt = `Write today's LinkedIn post for Amit's PERSONAL profile.

${PERSONA_BACKSTORY}

TODAY'S PILLAR: ${pillar}

${VOICE_RULES}
${isOpinionDay ? '\nToday is an opinion day: take ONE clear position and argue it with conviction. Disagreement is welcome; wishy-washy is not.' : ''}

RECENTLY USED TITLES (do not repeat these stories or angles): ${recentTitles.length ? recentTitles.join(' | ') : '(none yet)'}

Return JSON: {"title": "<short internal label for the calendar, max 60 chars>", "post_text": "<the complete post>"}`;

  const { data } = await callLLMJson<PersonaDraft>(prompt, {
    model: 'sonnet',
    max_tokens: 1200,
    temperature: 0.8,
  });
  if (!data?.post_text) throw new Error('Persona generation returned no post_text');
  return data;
}

export interface PersonaIdeaTurn {
  action: 'discuss' | 'write' | 'abandon';
  reply: string;
  relevance: 'good fit' | 'caution' | 'poor fit';
  title?: string;
  post_text?: string;
}

/**
 * One turn of Arohan's "Persona Post Idea" flow (chat prefix "Persona Post
 * Idea"): Amit hands over an idea/context for his own LinkedIn profile, and
 * Arohan DEBATES it with him — a genuine opinionated take on fit, risk, and
 * angle, not a rubber stamp — before anything is written. Only once the two
 * of them converge (Amit gives a clear go-ahead, or the discussion lands on
 * an agreed angle) does this return action:"write" with the actual post.
 * Amit can also drop the idea mid-debate (action:"abandon").
 */
export async function personaIdeaTurn(
  originalIdea: string,
  debateSoFar: string,
  latestMessage: string,
  recentTitles: string[],
): Promise<PersonaIdeaTurn> {
  const prompt = `You are Arohan, discussing a possible LinkedIn post for Amit's PERSONAL profile persona stream with Amit (the founder). He proposes ideas or context — sometimes a current event with no obvious link to him or In-Sync — and you debate whether/how it fits this profile BEFORE anything gets written. This is a real debate: agree, disagree, or propose a sharper angle. Do not just rubber-stamp whatever he says.

${PERSONA_BACKSTORY}

${VOICE_RULES}

HOW TO JUDGE FIT:
- Good: the idea connects naturally to Amit's own lived experience (building/running a business, leadership, scaling pains, AI-driven operations, how Indian SMBs work), or a current event can genuinely be pivoted into one of those lenses without forcing it.
- Caution: postable, but has some risk — sensitive topic, thin connection to his voice, reads as generic commentary anyone could post, or drifts toward opinion/political territory.
- Poor fit: no plausible personal/professional angle — pure partisan politics, exploiting tragedy, or a hot-take with no connection to him. If Amit pushes for this anyway, hold your position and explain why in the debate rather than complying.
- Never let a "write" turn produce a fabricated statistic or claim about a real-world event beyond common public knowledge, and never let it become a partisan political statement — Amit's own reflection/reaction only.

ORIGINAL IDEA AMIT RAISED: "${originalIdea}"

DEBATE SO FAR:
${debateSoFar || '(this is the first turn — Amit just raised the idea)'}

AMIT'S LATEST MESSAGE: "${latestMessage}"

RECENTLY USED TITLES (avoid repeating these stories/angles if you write): ${recentTitles.length ? recentTitles.join(' | ') : '(none yet)'}

Decide the action for THIS turn:
- "discuss": you still have something to weigh in on (a relevance concern, a sharper angle, a clarifying question, or a response to his pushback). Do NOT write post_text this turn.
- "write": Amit has clearly signaled to go ahead, or you've both converged on a specific angle — write the complete post now, in his voice.
- "abandon": Amit has said to drop/skip the idea. Acknowledge and stop — no post_text.

Return JSON: {"action": "discuss" | "write" | "abandon", "reply": "<your chat message to Amit — for 'discuss'/'abandon' this IS your full response; for 'write' a short line introducing the draft, e.g. 'Here's the draft:'>", "relevance": "good fit" | "caution" | "poor fit", "title": "<only if action=write, short internal label max 60 chars>", "post_text": "<only if action=write, the complete post>"}`;

  const { data } = await callLLMJson<PersonaIdeaTurn>(prompt, {
    model: 'sonnet',
    max_tokens: 1300,
    temperature: 0.75,
  });
  if (!data?.action || !data?.reply) throw new Error('Persona idea turn returned incomplete data');
  if (data.action === 'write' && !data.post_text) throw new Error('Persona idea "write" turn returned no post_text');
  return data;
}
