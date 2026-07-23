/**
 * Native LinkedIn Poll generation — shared between the company page and
 * persona streams in mkt-blog-writer (2026-07-24, engagement-quality
 * feedback: "conduct a poll sometimes"). Verified against LinkedIn's Poll
 * API docs: question <=140 chars, 2-4 options <=30 chars each, duration
 * ONE_DAY/THREE_DAYS/SEVEN_DAYS/FOURTEEN_DAYS, same w_organization_social/
 * w_member_social scopes already granted — no new LinkedIn permission
 * needed. Polls are LinkedIn-native only; mkt-blog-poster does not fan a
 * poll out to Facebook/Instagram/X (no equivalent object there).
 */
import { callLLMJson } from './llmClient.ts';

export type PollDuration = 'ONE_DAY' | 'THREE_DAYS' | 'SEVEN_DAYS' | 'FOURTEEN_DAYS';

export interface PollDraft {
  title: string;
  question: string;
  options: string[];
  duration: PollDuration;
}

/**
 * `voiceContext` is the caller's own backstory/brand block (PERSONA_BACKSTORY
 * or BRAND_STORY) — this module has no opinion on which voice, only on the
 * mechanics of a good poll.
 */
export async function generatePoll(voiceContext: string, topicHint: string, recentQuestions: string[]): Promise<PollDraft> {
  const prompt = `Write a LinkedIn poll.

${voiceContext}

TOPIC DIRECTION: ${topicHint}

RULES:
- The question must be something the audience has a genuine, immediate opinion on from their own daily work — not a trivia question, not a survey nobody has stakes in. A good poll question makes someone feel slightly exposed picking an answer, or curious enough about the results to comment their own situation.
- Question: max 140 characters, no trailing question mark needed if it reads naturally without one, but usually does.
- 2-4 options, each max 30 characters, mutually exclusive, covering the realistic range of answers (not a strawman with one obviously-right option).
- NEVER ask about political opinions, health status, religion, or any sensitive personal data — LinkedIn's own poll policy prohibits this and will reject or flag it.
- Do not turn this into a product pitch — a poll is a conversation-starter, not an ad. In-Sync should not be named in the question or options.

RECENTLY USED POLL QUESTIONS (do not repeat): ${recentQuestions.length ? recentQuestions.join(' | ') : '(none yet)'}

Return JSON: {"title": "<short internal label for the calendar, max 60 chars>", "question": "<the poll question, max 140 chars>", "options": ["<option, max 30 chars>", ...2-4 total]}`;

  const { data } = await callLLMJson<{ title: string; question: string; options: string[] }>(prompt, {
    model: 'sonnet',
    max_tokens: 400,
    temperature: 0.8,
  });
  if (!data?.question || !data?.options?.length || data.options.length < 2 || data.options.length > 4) {
    throw new Error('Poll generation returned an invalid question/options shape');
  }
  return {
    title: data.title,
    question: data.question.slice(0, 140),
    options: data.options.slice(0, 4).map((o) => o.slice(0, 30)),
    duration: 'THREE_DAYS', // gives 3 days of vote-driven visibility without going stale in the feed
  };
}
