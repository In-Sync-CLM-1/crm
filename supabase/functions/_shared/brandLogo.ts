/**
 * In-Sync logo watermark — stamped onto every generated marketing image so
 * the brand survives once a post is downloaded/reshared off-platform.
 *
 * Uses the icon-only mark (transparent PNG, no wordmark/tagline) because the
 * full logo lockup is illegible once shrunk to watermark size.
 */
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';
import { uploadToMarketingR2 } from './r2Marketing.ts';

export const LOGO_MARK_URL = 'https://crm-marketing-store.echocommunicator.workers.dev/brand/logo-mark.png';

export type LogoCorner = 'br' | 'bl' | 'tr' | 'tl';

let cachedLogoBytes: Uint8Array | null = null;

export async function fetchLogoBytes(): Promise<Uint8Array> {
  if (cachedLogoBytes) return cachedLogoBytes;
  const res = await fetch(LOGO_MARK_URL, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Logo mark fetch failed: ${res.status}`);
  cachedLogoBytes = new Uint8Array(await res.arrayBuffer());
  return cachedLogoBytes;
}

/**
 * Composite the logo mark onto raw image bytes as a corner watermark and
 * return re-encoded JPEG bytes. `widthPct` is the logo's width as a fraction
 * of the source image's width.
 */
export async function stampLogoOnBytes(
  imageBytes: Uint8Array,
  corner: LogoCorner = 'br',
  widthPct = 0.15,
): Promise<Uint8Array> {
  const img = await Image.decode(imageBytes);
  const logo = await Image.decode(await fetchLogoBytes());

  const targetW = Math.round(img.width * widthPct);
  logo.resize(targetW, Image.RESIZE_AUTO);

  const margin = Math.round(img.width * 0.04);
  const positions: Record<LogoCorner, [number, number]> = {
    br: [img.width - logo.width - margin, img.height - logo.height - margin],
    bl: [margin, img.height - logo.height - margin],
    tr: [img.width - logo.width - margin, margin],
    tl: [margin, margin],
  };
  const [x, y] = positions[corner];
  img.composite(logo, x, y);

  return await img.encodeJPEG(90);
}

/**
 * Fetch a source image URL, stamp the logo watermark, and re-upload the
 * branded version to the marketing R2 bucket under `${r2Key}.jpg`.
 */
export async function brandImageUrl(imageUrl: string, r2Key: string, corner: LogoCorner = 'br'): Promise<string> {
  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Source image fetch failed: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const stamped = await stampLogoOnBytes(bytes, corner);
  return await uploadToMarketingR2(`${r2Key}.jpg`, stamped, 'image/jpeg');
}
