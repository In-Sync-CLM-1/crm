/**
 * Renders a carousel slide (background photo + dark band + white text) using
 * ImageScript entirely in-process, instead of Shotstack's still-frame capture.
 *
 * Shotstack's still-image output (both output.range+jpg and output.poster on
 * an mp4) proved unreliable for multi-track composites during testing — the
 * background and title text never reliably appeared together in the same
 * still frame (one or the other was silently dropped depending on which
 * capture method was used), even though the equivalent video output (which
 * has been running in production for months) composites the same two tracks
 * correctly when played over time. Rendering locally avoids depending on
 * that behavior entirely.
 */
import { Image, TextLayout } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';

const FONT_URL = 'https://github.com/googlefonts/opensans/raw/main/fonts/ttf/OpenSans-Bold.ttf';
let cachedFont: Uint8Array | null = null;

async function getFont(): Promise<Uint8Array> {
  if (cachedFont) return cachedFont;
  const res = await fetch(FONT_URL, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Font fetch failed: ${res.status}`);
  cachedFont = new Uint8Array(await res.arrayBuffer());
  return cachedFont;
}

const SIZE = 1080;

export async function renderSlideImage(bgImageUrl: string, text: string): Promise<Uint8Array> {
  const bgRes = await fetch(bgImageUrl, { signal: AbortSignal.timeout(20_000) });
  if (!bgRes.ok) throw new Error(`Slide background fetch failed: ${bgRes.status}`);
  const bg = await Image.decode(new Uint8Array(await bgRes.arrayBuffer()));
  bg.cover(SIZE, SIZE);

  // Dark semi-transparent band across the middle for legibility — same
  // dark-background, minimal-white-text branding as the existing videos.
  const bandHeight = 420;
  const bandY = Math.floor((SIZE - bandHeight) / 2);
  bg.drawBox(0, bandY, SIZE, bandHeight, Image.rgbaToColor(0, 0, 0, 165));

  const fontBytes = await getFont();
  const textImg = await Image.renderText(
    fontBytes,
    58,
    text,
    Image.rgbaToColor(255, 255, 255, 255),
    new TextLayout({ maxWidth: SIZE - 160, wrapStyle: 'word' }),
  );

  const tx = Math.floor((SIZE - textImg.width) / 2);
  const ty = Math.floor(bandY + (bandHeight - textImg.height) / 2);
  bg.composite(textImg, tx, ty);

  return await bg.encodeJPEG(85);
}
