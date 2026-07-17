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
 * Visual style rotation — a deliberate visual break across the feed and a
 * variable to watch for which style holds attention best. `photo` is the
 * original/default treatment; the others trade photorealism (and its failure
 * modes — fake UI text, split-panel compositions) for illustrated styles.
 */
export type ImageStyle = 'photo' | 'illustration' | '3d' | 'abstract';
export const IMAGE_STYLES: ImageStyle[] = ['photo', 'illustration', '3d', 'abstract'];

const STYLE_TEMPLATES: Record<ImageStyle, (scene: string, industries: string) => string> = {
  photo: (scene, industries) => [
    `Professional editorial photograph for a B2B SaaS brand: ${scene}.`,
    `Indian workplace context — Indian professionals in a modern Indian office (${industries} setting).`,
    'Natural light, shallow depth of field, photorealistic, high detail, muted corporate palette.',
  ].join(' '),
  illustration: (scene, industries) => [
    `Flat vector illustration for a B2B SaaS brand depicting: ${scene}.`,
    `Indian professionals in a modern office (${industries} setting), rendered in a clean flat-design illustration style —`,
    'bold simple shapes, minimal line detail, limited palette built from teal and coral accents on a soft neutral background,',
    'no photorealism, no photographic texture, flat color blocks only.',
  ].join(' '),
  '3d': (scene, industries) => [
    `Soft 3D rendered illustration for a B2B SaaS brand depicting: ${scene}.`,
    `Indian professionals in a modern office (${industries} setting), shown as smooth minimal 3D characters (Notion/Stripe-style 3D illustration),`,
    'soft studio lighting, gentle shadows, rounded friendly shapes, muted pastel palette with teal and coral accents.',
  ].join(' '),
  abstract: (scene, industries) => [
    `Abstract conceptual graphic for a B2B SaaS brand representing: ${scene}, in the context of ${industries}.`,
    'Flowing geometric shapes, gradient mesh in brand teal-to-coral, translucent panel and data-flow motifs rendered abstractly,',
    'no literal people, no realistic scene, clean modern SaaS-marketing aesthetic.',
    'This is a pure abstract graphic, not an infographic, not a dashboard mockup, not a diagram — no panel or shape may carry a caption, label, callout, or any word on it.',
  ].join(' '),
};

/**
 * Build an image prompt from the post's context. `keywords` come from the
 * LLM's image_keywords; `industries` grounds the scene in the ICP's world;
 * `style` picks the visual treatment (defaults to the original photo style).
 */
export function buildImagePrompt(keywords: string[], industries: string, extra = '', style: ImageStyle = 'photo'): string {
  const scene = keywords.slice(0, 4).join(', ');
  return [
    STYLE_TEMPLATES[style](scene, industries || 'business'),
    'It must be ONE single continuous composition — never a split/side-by-side layout, never a multi-panel grid, never a collage of separate frames.',
    extra,
    'Final reminder, the single most important constraint: the image must contain ABSOLUTELY ZERO text of any kind anywhere in the frame — no words, lettering, numbers, captions, labels, signage, watermarks, or fake UI/screen text, even a single word, even if the concept implies a comparison or message.',
    'Equally important: NO logos or brand marks of any kind — no invented company logo, emblem, badge, crest, monogram, app icon, or trademark/® symbol may appear anywhere: not on walls, screens, laptops, clothing, mugs, signage, or floating in a corner. The scene must be completely brand-free.',
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
