/**
 * Combines N rendered carousel slide images into a single multi-page PDF —
 * LinkedIn's "Document" post type (the swipeable carousel) takes one PDF,
 * not a list of images, so this is the assembly step between Shotstack's
 * per-slide renders and the LinkedIn document upload.
 */
import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1';

export async function buildCarouselPdf(slideImageUrls: string[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  for (const url of slideImageUrls) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Failed to fetch carousel slide ${url}: ${res.status}`);
    const contentType = res.headers.get('content-type') ?? '';
    const bytes = new Uint8Array(await res.arrayBuffer());

    const img = contentType.includes('png') || url.toLowerCase().endsWith('.png')
      ? await pdfDoc.embedPng(bytes)
      : await pdfDoc.embedJpg(bytes);

    const page = pdfDoc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }

  return pdfDoc.save();
}
