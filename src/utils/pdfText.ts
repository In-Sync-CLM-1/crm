import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// Returns the text of every page as visual lines (items grouped by baseline).
export async function extractPdfLines(data: ArrayBuffer): Promise<string[]> {
  return extractLinesWith(pdfjs, data);
}

export async function extractLinesWith(lib: typeof pdfjs, data: ArrayBuffer): Promise<string[]> {
  const doc = await lib.getDocument({ data: new Uint8Array(data) }).promise;
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    const byY = new Map<number, { x: number; s: string }[]>();
    for (const it of content.items as Array<{ str: string; transform: number[] }>) {
      if (!it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      const bucket = [...byY.keys()].find(k => Math.abs(k - y) <= 2) ?? y;
      if (!byY.has(bucket)) byY.set(bucket, []);
      byY.get(bucket)!.push({ x: it.transform[4], s: it.str });
    }
    [...byY.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, parts]) => out.push(parts.sort((a, b) => a.x - b.x).map(t => t.s).join(" ")));
  }
  return out;
}
