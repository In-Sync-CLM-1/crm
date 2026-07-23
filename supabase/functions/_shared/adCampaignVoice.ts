/**
 * Ad campaign copywriting for the autonomous paid-ads engine
 * (mkt-ad-campaign-generator). This module only WRITES a campaign brief —
 * it never decides whether to launch (that's the generator's job, gated by
 * the human-set budget) and never calls the ad platforms itself (that's
 * mkt-google-ads-launch / mkt-meta-ads-launch).
 */
import { callLLMJson } from './llmClient.ts';
import { BRAND_STORY } from './brandVoice.ts';

export interface AdCampaignBrief {
  name: string;
  strategy_note: string;
  duration_days: number;
  // Google
  headlines?: string[];
  descriptions?: string[];
  keywords?: Array<{ text: string; match_type: 'PHRASE' | 'EXACT' | 'BROAD' }>;
  // Meta
  primary_text?: string;
  headline?: string;
  targeting_interests?: string[];
  // Shared
  image_keywords: string[];
}

interface ProductContext {
  product_key: string;
  product_name: string;
  product_url: string;
  industries?: string[];
  designations?: string[];
  pain_points?: string[];
}

/**
 * Writes one campaign brief. `performanceSummary` is a plain-text digest of
 * recent campaign/keyword results (what worked, what didn't) so the engine
 * genuinely learns cycle over cycle instead of repeating the same angle —
 * pass '(no prior campaigns yet)' on the first run for a channel.
 */
export async function generateAdCampaign(
  channel: 'google' | 'meta',
  product: ProductContext,
  performanceSummary: string,
  dailyBudget: number,
  recentNames: string[],
): Promise<AdCampaignBrief> {
  const audience = product.designations?.length ? product.designations.join(', ') : 'business decision-makers';
  const industries = product.industries?.length ? product.industries.join(', ') : 'Indian SMBs';
  const painPoints = product.pain_points?.length ? product.pain_points.join('; ') : '';

  const sharedContext = `${BRAND_STORY}

PRODUCT TO PROMOTE: ${product.product_name} (${product.product_url})
AUDIENCE: ${audience} in ${industries}
PAIN POINTS: ${painPoints || 'general operational fragmentation'}
DAILY BUDGET: ₹${dailyBudget}/day

RECENT PERFORMANCE (learn from this — double down on what works, drop what doesn't):
${performanceSummary}

RECENTLY USED CAMPAIGN NAMES/ANGLES (do not repeat): ${recentNames.length ? recentNames.join(' | ') : '(none yet)'}`;

  if (channel === 'google') {
    const prompt = `Write a Google Ads Search campaign for In-Sync.

${sharedContext}

Return JSON:
{
  "name": "<short campaign name, includes the product and angle, max 60 chars>",
  "strategy_note": "<2-3 sentences: the angle chosen and why, referencing the performance data if any>",
  "duration_days": <int, 7-30, pick based on budget and how much data a good read needs — smaller budgets need longer runs>,
  "headlines": [<5-8 headlines, each ONE clear benefit/CTA/keyword-relevant phrase, EACH STRICTLY under 30 characters, no punctuation gimmicks>],
  "descriptions": [<2-3 descriptions, each under 90 characters, concrete and specific, no vague claims>],
  "keywords": [{"text": "<search phrase a real buyer would type>", "match_type": "PHRASE"} , ... 8-15 keywords, mix of product-specific and pain-point-specific searches, all realistic real search queries, no branded competitor names],
  "image_keywords": [<2-4 keywords, unused for Google but keep the shape consistent>]
}`;
    const { data } = await callLLMJson<AdCampaignBrief>(prompt, { model: 'sonnet', max_tokens: 1400, temperature: 0.6 });
    if (!data?.headlines?.length || !data?.descriptions?.length || !data?.keywords?.length) {
      throw new Error('Google ad campaign brief missing headlines/descriptions/keywords');
    }
    return data;
  }

  const prompt = `Write a Meta (Facebook + Instagram) ad campaign for In-Sync.

${sharedContext}

Return JSON:
{
  "name": "<short campaign name, includes the product and angle, max 60 chars>",
  "strategy_note": "<2-3 sentences: the angle chosen and why, referencing the performance data if any>",
  "duration_days": <int, 7-30>,
  "primary_text": "<the main ad copy, 1-3 short punchy lines, under 300 characters, plain language, no corporate voice, ends with what to do next>",
  "headline": "<short headline, under 40 characters>",
  "targeting_interests": [<3-6 Meta interest-targeting terms relevant to ${industries}/${audience}, e.g. "Small business", "Entrepreneurship">],
  "image_keywords": [<2-4 short visual keywords for the ad image>]
}`;
  const { data } = await callLLMJson<AdCampaignBrief>(prompt, { model: 'sonnet', max_tokens: 900, temperature: 0.6 });
  if (!data?.primary_text || !data?.headline) throw new Error('Meta ad campaign brief missing primary_text/headline');
  return data;
}
