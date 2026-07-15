/**
 * Renders a carousel slide entirely in-process with ImageScript.
 *
 * Shotstack's still-image output (both output.range+jpg and output.poster on
 * an mp4) proved unreliable for multi-track composites during testing — the
 * background and title text never reliably appeared together in the same
 * still frame, even though the equivalent video output composites the same
 * two tracks correctly when played over time. Rendering locally avoids
 * depending on that behavior entirely.
 *
 * Design (2026-07-15 rework, after image-quality feedback): instead of a hard
 * dark band across the middle, slides now use a full-height bottom-weighted
 * gradient scrim with left-aligned display type in the lower third, a thin
 * accent rule, a slide counter top-right, and an In-Sync wordmark — the same
 * dark/minimal branding as the videos, but composed like a designed slide
 * rather than a caption stamped on a photo.
 */
import { Image, TextLayout } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';

const FONT_URL = 'https://github.com/googlefonts/opensans/raw/main/fonts/ttf/OpenSans-Bold.ttf';
const FONT_REGULAR_URL = 'https://github.com/googlefonts/opensans/raw/main/fonts/ttf/OpenSans-SemiBold.ttf';

let cachedBold: Uint8Array | null = null;
let cachedRegular: Uint8Array | null = null;

async function fetchFont(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Font fetch failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function getFonts(): Promise<{ bold: Uint8Array; regular: Uint8Array }> {
  if (!cachedBold) cachedBold = await fetchFont(FONT_URL);
  if (!cachedRegular) {
    cachedRegular = await fetchFont(FONT_REGULAR_URL).catch(() => cachedBold);
  }
  return { bold: cachedBold!, regular: cachedRegular! };
}

const SIZE = 1080;
const MARGIN = 84;

export async function renderSlideImage(
  bgImageUrl: string,
  text: string,
  slideNum?: number,
  slideTotal?: number,
): Promise<Uint8Array> {
  const bgRes = await fetch(bgImageUrl, { signal: AbortSignal.timeout(20_000) });
  if (!bgRes.ok) throw new Error(`Slide background fetch failed: ${bgRes.status}`);
  const bg = await Image.decode(new Uint8Array(await bgRes.arrayBuffer()));
  bg.cover(SIZE, SIZE);

  // Light global darken so white type reads anywhere on the photo.
  bg.drawBox(0, 0, SIZE, SIZE, Image.rgbaToColor(8, 10, 16, 70));

  // Bottom-weighted gradient scrim: transparent at 35% height → near-black at
  // the bottom edge. Drawn as 4px horizontal strips (270 blends, cheap).
  const scrimTop = Math.floor(SIZE * 0.35);
  const strip = 4;
  for (let y = scrimTop; y < SIZE; y += strip) {
    const t = (y - scrimTop) / (SIZE - scrimTop); // 0 → 1
    const alpha = Math.round(200 * t * t + 20 * t); // ease-in, max ~220
    bg.drawBox(0, y, SIZE, Math.min(strip, SIZE - y), Image.rgbaToColor(6, 8, 14, alpha));
  }

  const { bold, regular } = await getFonts();
  const white = Image.rgbaToColor(255, 255, 255, 255);
  const dim = Image.rgbaToColor(255, 255, 255, 175);

  // Main slide text — left-aligned display type in the lower third.
  const textImg = await Image.renderText(
    bold,
    64,
    text,
    white,
    new TextLayout({ maxWidth: SIZE - MARGIN * 2, wrapStyle: 'word' }),
  );
  const textY = SIZE - MARGIN - 96 - textImg.height; // 96px reserved for footer row
  bg.composite(textImg, MARGIN, Math.max(scrimTop + 40, textY));

  // Thin accent rule above the text block.
  bg.drawBox(MARGIN, Math.max(scrimTop + 40, textY) - 28, 120, 6, white);

  // Footer row: wordmark bottom-left, slide counter bottom-right.
  const wordmark = await Image.renderText(regular, 30, 'In-Sync', dim);
  bg.composite(wordmark, MARGIN, SIZE - MARGIN + 10 - wordmark.height);

  if (slideNum && slideTotal) {
    const counter = await Image.renderText(regular, 30, `${slideNum} / ${slideTotal}`, dim);
    bg.composite(counter, SIZE - MARGIN - counter.width, SIZE - MARGIN + 10 - counter.height);
  }

  return await bg.encodeJPEG(90);
}
