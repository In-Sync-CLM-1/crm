/**
 * "Post Idea" trend-jack flow (2026-07-23) — the multi-channel sibling of
 * personaVoice.ts's "Persona Post Idea". Chat prefix "Post Idea <channels>:
 * <context>" lets Amit react to a trending topic on a SUBSET of the brand's
 * channels (e.g. Facebook + Instagram + X, deliberately skipping LinkedIn's
 * thought-leadership stream). Same debate-then-write pattern as the persona
 * flow, but company/brand voice instead of Amit's personal voice, and —
 * per Amit's explicit instruction — the finished post goes out IMMEDIATELY
 * once finalized rather than queuing into the Content Calendar: trend
 * content stales out fast, so it does not get the usual review buffer.
 */
import { callLLMJson } from './llmClient.ts';
import { BRAND_STORY } from './brandVoice.ts';

export type TrendChannel = 'facebook' | 'instagram' | 'x';

// Recognized channel names/aliases a message can name after "Post Idea".
// LinkedIn/YouTube are deliberately NOT here yet — LinkedIn already has its
// own daily stream + the persona flow, and YouTube needs video (out of scope
// for a same-day trend reaction). Extend this map if that changes.
export const CHANNEL_ALIASES: Record<string, TrendChannel> = {
  facebook: 'facebook', fb: 'facebook',
  instagram: 'instagram', insta: 'instagram', ig: 'instagram',
  x: 'x', twitter: 'x',
};

export const CHANNEL_LABEL: Record<TrendChannel, string> = {
  facebook: 'Facebook', instagram: 'Instagram', x: 'X',
};

export interface TrendPostTurn {
  action: 'discuss' | 'write' | 'abandon';
  reply: string;
  relevance: 'good fit' | 'caution' | 'poor fit';
  title?: string;
  post_text?: string;
  image_keywords?: string[];
}

/**
 * One turn of the trend-jack debate. Mirrors personaIdeaTurn's shape and
 * judgment style (genuine pushback, not a rubber stamp) but for the BRAND
 * voice on the named channels, and short/punchy trend-reactive copy instead
 * of LinkedIn's long-form thought-leadership structure.
 */
export async function trendPostTurn(
  channels: TrendChannel[],
  originalIdea: string,
  debateSoFar: string,
  latestMessage: string,
): Promise<TrendPostTurn> {
  const channelLabels = channels.map((c) => CHANNEL_LABEL[c]).join(', ');

  const prompt = `You are Arohan, discussing a possible TREND-JACK post for the In-Sync brand with Amit (the founder). He wants to react to something timely — a current event, a trending topic — on specific channels: ${channelLabels}. This is explicitly NOT the long-form LinkedIn thought-leadership stream; it is short, fast, native-feeling content for these channels, published immediately once finalized (no review queue — trend content stales out fast). You debate whether/how it fits the brand BEFORE anything gets written — a real debate, not a rubber stamp.

${BRAND_STORY}

TARGET CHANNELS FOR THIS POST: ${channelLabels}

HOW TO JUDGE FIT:
- Good: the trend can be connected to something In-Sync's audience (growing Indian SMB operators) actually feels, OR it is safe, on-brand, lighthearted commentary that suits a company voice without forcing a pitch.
- Caution: postable, but some risk — thin connection to the brand, reads as generic bandwagon content, or brushes against a sensitive topic.
- Poor fit: no plausible brand angle, or touches active conflict/casualties/religion/partisan politics — a company page has more reputational exposure than a personal profile, so hold a HIGHER bar here than you would for a personal post. If Amit pushes for this anyway, hold your position and explain why.
- Never fabricate a statistic or claim about a real-world event beyond common public knowledge. Never take a partisan political position. Never force an In-Sync product pitch into a trend reaction — if it appears at all, it must feel earned, not bolted on.

VOICE FOR THE WRITTEN POST (when action=write):
- Short and punchy — 1-4 lines, plain language, no corporate voice, no hashtag stuffing (0-2 relevant hashtags at most).
- Total length under 280 characters (it must work natively on all of ${channelLabels} without truncation reading awkwardly).
- No emoji unless the trend genuinely calls for one sparingly.
- A light brand mention is fine ONLY if it lands naturally; never a hard sell or a link (links are never included in the post text).

ORIGINAL IDEA AMIT RAISED: "${originalIdea}"

DEBATE SO FAR:
${debateSoFar || '(this is the first turn — Amit just raised the idea)'}

AMIT'S LATEST MESSAGE: "${latestMessage}"

Decide the action for THIS turn:
- "discuss": you still have something to weigh in on (a relevance/brand-risk concern, a sharper angle, a clarifying question, or a response to his pushback). Do NOT write post_text this turn.
- "write": Amit has clearly signaled to go ahead, or you've both converged — write the complete short post now, in brand voice, ready to publish immediately.
- "abandon": Amit has said to drop/skip the idea. Acknowledge and stop — no post_text.

The "reply" field is shown as plain text in a chat UI, not rendered markdown — NEVER use markdown syntax in "reply" (no **bold**, no # headers, no - or * bullet lists, no backticks). Write it in plain prose. (This restriction does NOT apply to post_text — write that exactly as specified above.)

Return JSON: {"action": "discuss" | "write" | "abandon", "reply": "<your chat message to Amit — for 'discuss'/'abandon' this IS your full response; for 'write' a short line introducing the draft>", "relevance": "good fit" | "caution" | "poor fit", "title": "<only if action=write, short internal label max 60 chars>", "post_text": "<only if action=write, the complete short post, under 280 characters>", "image_keywords": ["<2-4 short visual keywords for an accompanying photo, only meaningful if Instagram is a target channel>"]}`;

  const { data } = await callLLMJson<TrendPostTurn>(prompt, {
    model: 'sonnet',
    max_tokens: 900,
    temperature: 0.75,
  });
  if (!data?.action || !data?.reply) throw new Error('Trend post turn returned incomplete data');
  if (data.action === 'write' && !data.post_text) throw new Error('Trend post "write" turn returned no post_text');
  return data;
}
