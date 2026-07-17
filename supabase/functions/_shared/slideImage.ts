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
 * Design (2026-07-15, second rework — "all slides look black" feedback): the
 * photo must stay visible. No global darken; the scrim is scoped to the text
 * block only — transparent above it, ramping to near-opaque dark by the first
 * text line and held to the bottom edge. The upper ~half of every slide is
 * the untouched photo; type, accent rule, wordmark, and counter sit inside
 * the scrimmed lower band.
 */
import { Image, TextLayout } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';
import { fetchLogoBytes } from './brandLogo.ts';

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
  const textY = Math.max(120, SIZE - MARGIN - 96 - textImg.height); // 96px reserved for footer row

  // Scrim scoped to the text block: transparent above it, easing (smoothstep,
  // long ramp) to a translucent dark band behind the text, held to the bottom
  // edge — the photo above stays untouched and still ghosts through the band.
  // IMPORTANT: drawBox does NOT alpha-blend — it overwrites pixels with the
  // raw RGBA value (which JPEG then flattens to opaque). The gradient must be
  // drawn on its own transparent layer and composited, which does blend.
  const scrimStart = Math.max(0, textY - 300);
  const rampEnd = textY - 20;
  const strip = 4;
  const scrim = new Image(SIZE, SIZE - scrimStart);
  for (let y = scrimStart; y < SIZE; y += strip) {
    const t = Math.min(1, (y - scrimStart) / (rampEnd - scrimStart));
    const alpha = Math.round(185 * t * t * (3 - 2 * t)); // smoothstep, max ~185
    scrim.drawBox(0, y - scrimStart, SIZE, Math.min(strip, SIZE - y), Image.rgbaToColor(6, 8, 14, alpha));
  }
  bg.composite(scrim, 0, scrimStart);

  bg.composite(textImg, MARGIN, textY);

  // Thin accent rule above the text block.
  bg.drawBox(MARGIN, textY - 28, 120, 6, white);

  // In-Sync logo mark top-right, clear of the text block which always sits
  // left-aligned in the lower band — top-right stays uncluttered on every
  // slide regardless of how much text a slide carries.
  const logo = await Image.decode(await fetchLogoBytes());
  const logoH = 48;
  logo.resize(Image.RESIZE_AUTO, logoH);
  bg.composite(logo, SIZE - MARGIN - logo.width, MARGIN);

  // Footer row: slide counter bottom-right.
  if (slideNum && slideTotal) {
    const counter = await Image.renderText(regular, 30, `${slideNum} / ${slideTotal}`, dim);
    bg.composite(counter, SIZE - MARGIN - counter.width, SIZE - MARGIN + 10 - counter.height);
  }

  return await bg.encodeJPEG(90);
}
