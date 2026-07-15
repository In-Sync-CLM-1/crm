/**
 * AI image generation via Gemini (gemini-2.5-flash-image) — the PRIMARY image
 * source for marketing posts. Pexels stock photos are the fallback only.
 *
 * Every creative must carry Indian cultural context (Indian people and
 * workplaces) — that requirement is baked into the prompt builder here so no
 * caller can forget it.
 */
import { uploadToMarketingR2 } from './r2Marketing.ts';

const GEMINI_MODEL = 'gemini-2.5-flash-image';

export type GeminiAspect = '1:1' | '4:5' | '9:16' | '16:9';

/**
 * Build a photographic prompt from the post's context. `keywords` come from
 * the LLM's image_keywords; `industries` grounds the scene in the ICP's world.
 */
export function buildImagePrompt(keywords: string[], industries: string, extra = ''): string {
  const scene = keywords.slice(0, 4).join(', ');
  return [
    `Professional editorial photograph for a B2B SaaS brand: ${scene}.`,
    `Indian workplace context — Indian professionals in a modern Indian office (${industries || 'business'} setting).`,
    'Natural light, shallow depth of field, photorealistic, high detail, muted corporate palette.',
    'Absolutely no text, no words, no logos, no watermarks anywhere in the image.',
    extra,
  ].filter(Boolean).join(' ');
}

/**
 * Generate an image and return the raw bytes, or null if the API key is not
 * configured or generation fails (caller falls back to Pexels).
 */
export async function generateGeminiImageBytes(prompt: string, aspectRatio: GeminiAspect): Promise<Uint8Array | null> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return null;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['IMAGE'],
            imageConfig: { aspectRatio },
          },
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!res.ok) {
      console.warn(`[geminiImage] generate failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const data = await res.json();
    const parts: Array<{ inlineData?: { mimeType: string; data: string } }> =
      data?.candidates?.[0]?.content?.parts || [];
    const img = parts.find((p) => p.inlineData?.data);
    if (!img?.inlineData) {
      console.warn('[geminiImage] no inlineData in response');
      return null;
    }
    const b64 = img.inlineData.data;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return bytes;
  } catch (e) {
    console.warn('[geminiImage] generate error:', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Generate an image and persist it to the marketing R2 bucket so downstream
 * consumers (LinkedIn upload, Shotstack, Instagram) get a stable public URL.
 * Returns null on any failure — caller falls back to Pexels.
 */
export async function generateGeminiImage(
  prompt: string,
  aspectRatio: GeminiAspect,
  r2KeyPrefix: string,
): Promise<string | null> {
  const bytes = await generateGeminiImageBytes(prompt, aspectRatio);
  if (!bytes) return null;
  try {
    return await uploadToMarketingR2(`${r2KeyPrefix}.png`, bytes, 'image/png');
  } catch (e) {
    console.warn('[geminiImage] R2 upload failed:', e instanceof Error ? e.message : e);
    return null;
  }
}
