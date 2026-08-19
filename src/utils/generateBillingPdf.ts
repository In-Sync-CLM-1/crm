import type { BillingDocument, BillingSellerSnapshot } from "@/types/billing";
import { DOC_TYPE_LABELS } from "@/types/billing";
import { formatINR, numberToWords, formatFinancialYear } from "@/utils/billingUtils";

// Real vector text via jsPDF + autoTable — not a rasterized screenshot. The old
// html2canvas approach embedded a full-page PNG (and re-embedded it per page in
// the overflow loop), producing >10MB files for a one-page text document.
// This produces the same layout at well under 1MB with selectable/searchable text.

const MARGIN = 15;
const PAGE_WIDTH = 210;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const PRIMARY: [number, number, number] = [10, 45, 90];
const MUTED: [number, number, number] = [110, 110, 120];
const LIGHT_BG: [number, number, number] = [244, 245, 248];

// jsPDF's standard fonts only support WinAnsi encoding — no ₹ (renders as a
// garbled glyph and throws off column-width math, clipping the digits after
// it) and no smart punctuation. "Rs." reads correctly everywhere and is what
// every bank/GST document in India already uses. Free-text fields (item
// descriptions, terms, notes) are user-typed and can contain the same
// unsupported characters, so they're sanitized too.
const money = (n: number) => `Rs. ${formatINR(n)}`;
const clean = (s?: string | null) =>
  (s || "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•●]/g, "-")
    .replace(/[^\x00-\xFF]/g, ""); // strip anything else outside WinAnsi rather than render garbage

interface ImageData { dataUrl: string; width: number; height: number }

// Reads width/height straight out of a PNG's IHDR chunk (bytes 16-23) from
// just the first ~75 decoded bytes — no full image decode needed. Used as
// the dimension source outside the browser (Node has no <Image>/<canvas>).
function pngDimensionsFromDataUrl(dataUrl: string): { width: number; height: number } | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const prefixB64 = dataUrl.slice(comma + 1, comma + 101);
  try {
    let bytes: Uint8Array;
    if (typeof Buffer !== "undefined") {
      bytes = new Uint8Array(Buffer.from(prefixB64, "base64"));
    } else {
      const bin = atob(prefixB64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    }
    if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null; // not a PNG
    const width = ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
    const height = ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
    return width && height ? { width, height } : null;
  } catch {
    return null;
  }
}

// A frozen seller_snapshot can carry a logo saved at its original upload
// resolution — one real one measured 11,030x15,062px (166 megapixels) for a
// slot displayed at 22x14mm. jsPDF has no native image decoder in the
// browser, so embedding that directly makes addImage() pure-JS-decode the
// whole thing — measured at 40+ seconds, which is what "the button doesn't
// work" actually was. Downscale through a real <canvas> (native, fast
// decode) before jsPDF ever sees it, and return the resulting pixel
// dimensions so the caller can fit it into its box without distorting the
// aspect ratio (source images are rarely already 22:14). No-ops the resize
// in Node (no DOM) — the one-off batch script doesn't hit this path's cost
// the same way a live click does — but still returns real dimensions via
// the PNG header so aspect-ratio fitting still works there too.
async function downscaleDataUrl(dataUrl: string, maxDim = 500): Promise<ImageData> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    const dims = pngDimensionsFromDataUrl(dataUrl);
    return { dataUrl, width: dims?.width || maxDim, height: dims?.height || maxDim };
  }
  try {
    return await new Promise<ImageData>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        if (Math.max(img.width, img.height) <= maxDim) {
          resolve({ dataUrl, width: img.width, height: img.height });
          return;
        }
        const scale = maxDim / Math.max(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve({ dataUrl, width: img.width, height: img.height }); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height });
      };
      img.onerror = () => reject(new Error("image decode failed"));
      img.src = dataUrl;
    });
  } catch {
    const dims = pngDimensionsFromDataUrl(dataUrl);
    return { dataUrl, width: dims?.width || maxDim, height: dims?.height || maxDim };
  }
}

// Works in both the browser (fetch → Blob) and Node (fetch → Buffer) — avoids
// FileReader, which only exists in the browser, so this same builder can run
// in a one-off Node script for bulk regeneration as well as the live app.
async function toDataUrl(url?: string): Promise<ImageData | null> {
  if (!url) return null;
  // A frozen seller_snapshot often already stores the logo/signature as a
  // data: URI (not a remote file) — decoding it and re-encoding straight
  // back to base64 is pure waste, and in the browser (no Buffer) the
  // fallback path builds the output one character at a time, which for a
  // multi-MB image is slow enough to look like the export silently hung.
  if (url.startsWith("data:")) return downscaleDataUrl(url);
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/png";
    const buf = new Uint8Array(await res.arrayBuffer());
    if (typeof Buffer !== "undefined") return downscaleDataUrl(`data:${contentType};base64,${Buffer.from(buf).toString("base64")}`);
    // Browser fallback for a genuinely remote image — chunked to avoid both
    // the call-stack limit of spreading a large array and the slowness of
    // building the string one byte at a time.
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < buf.length; i += CHUNK) {
      binary += String.fromCharCode(...buf.subarray(i, i + CHUNK));
    }
    return downscaleDataUrl(`data:${contentType};base64,${btoa(binary)}`);
  } catch {
    return null; // logo/signature is a nice-to-have — never block the PDF on it
  }
}

// Fit an image into a maxW x maxH box without distorting its aspect ratio.
function fitBox(img: ImageData, maxW: number, maxH: number): { w: number; h: number } {
  const scale = Math.min(maxW / img.width, maxH / img.height);
  return { w: img.width * scale, h: img.height * scale };
}

interface GenerateArgs {
  doc: BillingDocument;
  issuer: BillingSellerSnapshot;
  totalTds: number;
  totalAdvance: number;
  hasDeductions: boolean;
  amountPayable: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildBillingDocumentPdf({ doc, issuer, totalTds, totalAdvance, hasDeductions, amountPayable }: GenerateArgs): Promise<any> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const [logoDataUrl, signatureDataUrl] = await Promise.all([
    toDataUrl(issuer.logo_url),
    toDataUrl(issuer.signature_url),
  ]);

  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN;

  // ── Header: logo + company block, doc-type badge ──
  // Badge geometry is computed first so the company name/address can be
  // wrapped to never run under it — a long registered company name
  // ("PROSYNC AI SOLUTIONS (OPC) PRIVATE LIMITED") previously overlapped it.
  const headerTop = y;
  const badgeLabel = (DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type).toUpperCase();
  pdf.setFont("helvetica", "bold").setFontSize(11);
  const badgeW = pdf.getTextWidth(badgeLabel) + 10;
  const badgeColor: [number, number, number] =
    doc.doc_type === "invoice" ? PRIMARY : doc.doc_type === "credit_note" ? [220, 38, 38] : [14, 165, 233];

  if (logoDataUrl) {
    try {
      const { w, h } = fitBox(logoDataUrl, 22, 14);
      pdf.addImage(logoDataUrl.dataUrl, MARGIN + (22 - w) / 2, y + (14 - h) / 2, w, h, undefined, "FAST");
    } catch { /* unsupported format */ }
  }
  const textX = logoDataUrl ? MARGIN + 26 : MARGIN;
  const headerTextWidth = PAGE_WIDTH - MARGIN - textX;
  const nameMaxWidth = PAGE_WIDTH - MARGIN - badgeW - 6 - textX;

  pdf.setFont("helvetica", "bold").setFontSize(14).setTextColor(...PRIMARY);
  const nameLines: string[] = pdf.splitTextToSize(clean(issuer.company_name) || "Your Company", Math.max(nameMaxWidth, 30));
  pdf.text(nameLines, textX, y + 5);
  let hy = y + 5 + nameLines.length * 5.5;

  pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
  const addLine = (s: string) => {
    if (!s) return;
    const lines: string[] = pdf.splitTextToSize(clean(s), headerTextWidth);
    pdf.text(lines, textX, hy);
    hy += lines.length * 4;
  };
  addLine(issuer.company_address);
  addLine([issuer.company_gstin && `GSTIN: ${issuer.company_gstin}`, issuer.company_pan && `PAN: ${issuer.company_pan}`].filter(Boolean).join("   |   "));
  addLine([issuer.company_email && `Email: ${issuer.company_email}`, issuer.company_phone && `Ph: ${issuer.company_phone}`].filter(Boolean).join("   |   "));
  addLine(issuer.company_state && `State: ${issuer.company_state}${issuer.company_state_code ? ` (${issuer.company_state_code})` : ""}`);

  pdf.setFillColor(...badgeColor);
  pdf.roundedRect(PAGE_WIDTH - MARGIN - badgeW, headerTop, badgeW, 9, 1.5, 1.5, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.text(badgeLabel, PAGE_WIDTH - MARGIN - badgeW / 2, headerTop + 6, { align: "center" });

  y = Math.max(hy, headerTop + 16) + 3;
  pdf.setDrawColor(...PRIMARY).setLineWidth(0.6);
  pdf.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 6;

  // ── Bill To / Doc details boxes ──
  // Box height is derived from actual wrapped content instead of a fixed
  // 30mm — a long billing address (common with the "Floor No.: ... Name Of
  // Premises/Building: ... City/Town/Village: ..." format some clients use)
  // wraps to several lines, and drawing the next line at a fixed +4mm
  // regardless of how many lines the previous one actually took overlapped
  // everything into an unreadable stack.
  const boxW = (CONTENT_WIDTH - 6) / 2;
  const boxTop = y;
  const boxTextW = boxW - 8;

  pdf.setFont("helvetica", "bold").setFontSize(9);
  const nameLines2: string[] = pdf.splitTextToSize(clean(doc.client?.invoice_company_name || doc.client_name), boxTextW);
  pdf.setFont("helvetica", "normal").setFontSize(7.5);
  const billFields = [
    doc.client?.billing_address,
    [doc.client?.city, doc.client?.state].filter(Boolean).join(", ") + (doc.client?.pin_code ? ` - ${doc.client.pin_code}` : ""),
    doc.client?.gstin ? `GSTIN: ${doc.client.gstin}` : doc.client?.pan ? `PAN: ${doc.client.pan}` : undefined,
  ];
  const billLineGroups: string[][] = billFields.map((s) => (s ? pdf.splitTextToSize(clean(s), boxTextW) : []));
  const billContentH = 10 + nameLines2.length * 4 + billLineGroups.reduce((sum, g) => sum + g.length * 3.6, 0);

  const detailRows: [string, string][] = [
    ["DOC NUMBER", doc.doc_number],
    ["DATE", doc.doc_date],
    ["DUE DATE", doc.due_date],
    ["SUPPLY TYPE", doc.supply_type === "intra_state" ? "Intra-State" : "Inter-State"],
    ["FY", formatFinancialYear(doc.financial_year)],
  ];
  if (doc.original_invoice_number) detailRows.push(["AGAINST INVOICE", doc.original_invoice_number]);
  const detailContentH = 6 + detailRows.length * 4.6;

  const boxH = Math.max(30, billContentH + 4, detailContentH + 4);

  pdf.setFillColor(...LIGHT_BG).roundedRect(MARGIN, boxTop, boxW, boxH, 1.5, 1.5, "F");
  pdf.setFont("helvetica", "bold").setFontSize(7).setTextColor(...MUTED);
  pdf.text("BILL TO", MARGIN + 4, boxTop + 5);
  pdf.setFont("helvetica", "bold").setFontSize(9).setTextColor(20, 20, 20);
  pdf.text(nameLines2, MARGIN + 4, boxTop + 10);
  pdf.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...MUTED);
  let by = boxTop + 10 + nameLines2.length * 4;
  for (const lines of billLineGroups) {
    if (!lines.length) continue;
    pdf.text(lines, MARGIN + 4, by);
    by += lines.length * 3.6;
  }

  const detailX = MARGIN + boxW + 6;
  pdf.setFillColor(...LIGHT_BG).roundedRect(detailX, boxTop, boxW, boxH, 1.5, 1.5, "F");
  let dy = boxTop + 6;
  for (const [label, val] of detailRows) {
    pdf.setFont("helvetica", "bold").setFontSize(6.5).setTextColor(...MUTED);
    pdf.text(label, detailX + 4, dy);
    pdf.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(20, 20, 20);
    pdf.text(clean(val), detailX + boxW - 4, dy, { align: "right" });
    dy += 4.6;
  }
  y = boxTop + boxH + 4;

  // ── Line items table (real text cells, not an image) ──
  const isIntra = doc.supply_type === "intra_state";
  const head = ["#", "Description", "HSN/SAC", "Qty", "Rate", "Taxable", isIntra ? "CGST" : "IGST", ...(isIntra ? ["SGST"] : []), "Total"];
  const body = (doc.items || []).map((item, i) => [
    String(i + 1),
    clean(item.description),
    clean(item.hsn_sac),
    `${item.qty} ${clean(item.unit)}`,
    money(item.rate),
    money(item.taxable),
    money(isIntra ? item.cgst : item.igst),
    ...(isIntra ? [money(item.sgst)] : []),
    money(item.total),
  ]);

  autoTable(pdf, {
    head: [head],
    body,
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 2.2, textColor: [20, 20, 20] },
    headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: "bold", fontSize: 7 },
    alternateRowStyles: { fillColor: [250, 250, 252] },
    columnStyles: { 0: { cellWidth: 7 }, 1: { cellWidth: "auto" } },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (pdf as any).lastAutoTable.finalY + 6;

  // ── Summary ──
  const sumW = 70;
  const sumX = PAGE_WIDTH - MARGIN - sumW;
  const summaryRow = (label: string, val: string, bold = false, color: [number, number, number] = [20, 20, 20]) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal").setFontSize(bold ? 9.5 : 8.5).setTextColor(...color);
    pdf.text(label, sumX, y);
    pdf.text(val, PAGE_WIDTH - MARGIN, y, { align: "right" });
    y += bold ? 5.5 : 4.6;
  };
  summaryRow("Subtotal", money(doc.subtotal));
  if (isIntra) {
    summaryRow("CGST", money(doc.total_tax / 2));
    summaryRow("SGST", money(doc.total_tax / 2));
  } else {
    summaryRow("IGST", money(doc.total_tax));
  }
  pdf.setDrawColor(200, 200, 205).line(sumX, y, PAGE_WIDTH - MARGIN, y); y += 6;
  summaryRow("Grand Total", money(doc.total_amount), true, PRIMARY);
  if (hasDeductions) {
    pdf.setDrawColor(200, 200, 205).line(sumX, y, PAGE_WIDTH - MARGIN, y); y += 6;
    if (totalAdvance > 0) summaryRow("Less: Advance Received", `-${money(totalAdvance)}`, false, [5, 150, 105]);
    if (totalTds > 0) summaryRow("Less: TDS Deducted", `-${money(totalTds)}`, false, [220, 38, 38]);
    summaryRow("Amount Payable", money(amountPayable), true, [4, 120, 87]);
  }
  y += 4;

  // ── Amount in words ──
  const wordsLabel = hasDeductions ? "Amount Payable in Words:" : "Amount in Words:";
  const wordsText = numberToWords(hasDeductions ? amountPayable : doc.total_amount);
  pdf.setFillColor(...LIGHT_BG);
  const wordsLines = pdf.splitTextToSize(clean(`${wordsLabel} ${wordsText}`), CONTENT_WIDTH - 8);
  const wordsH = wordsLines.length * 4 + 6;
  pdf.roundedRect(MARGIN, y, CONTENT_WIDTH, wordsH, 1.5, 1.5, "F");
  pdf.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(60, 60, 60);
  pdf.text(wordsLines, MARGIN + 4, y + 5);
  y += wordsH + 6;

  // ── Bank + Signature ──
  const bankTop = y;
  pdf.setFont("helvetica", "bold").setFontSize(7).setTextColor(...MUTED);
  pdf.text("BANK DETAILS", MARGIN, y);
  pdf.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(20, 20, 20);
  y += 4.5;
  pdf.text(`Bank: ${clean(issuer.bank_name) || "-"}`, MARGIN, y); y += 4;
  pdf.text(`A/C: ${issuer.bank_account_number || "-"}`, MARGIN, y); y += 4;
  pdf.text(`IFSC: ${issuer.bank_ifsc || "-"}`, MARGIN, y); y += 4;
  if (issuer.bank_upi_id) { pdf.text(`UPI: ${issuer.bank_upi_id}`, MARGIN, y); y += 4; }

  let sigY = bankTop;
  pdf.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(20, 20, 20);
  pdf.text(`For ${clean(issuer.company_name) || "Your Company"}`, PAGE_WIDTH - MARGIN, sigY, { align: "right" });
  sigY += 3;
  if (signatureDataUrl) {
    try {
      const { w, h } = fitBox(signatureDataUrl, 26, 12);
      pdf.addImage(signatureDataUrl.dataUrl, PAGE_WIDTH - MARGIN - w, sigY + (12 - h) / 2, w, h, undefined, "FAST");
    } catch { /* unsupported format */ }
  }
  sigY += 14;
  pdf.setFont("helvetica", "normal").setFontSize(7).setTextColor(...MUTED);
  pdf.text("Authorized Signatory", PAGE_WIDTH - MARGIN, sigY, { align: "right" });

  y = Math.max(y, sigY) + 6;

  // ── Terms + Notes ──
  const block = (title: string, text: string) => {
    pdf.setDrawColor(220, 220, 225).line(MARGIN, y, PAGE_WIDTH - MARGIN, y); y += 6;
    pdf.setFont("helvetica", "bold").setFontSize(7).setTextColor(...MUTED);
    pdf.text(title.toUpperCase(), MARGIN, y); y += 5;
    pdf.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(60, 60, 60);
    const lines = pdf.splitTextToSize(clean(text), CONTENT_WIDTH);
    pdf.text(lines, MARGIN, y);
    y += lines.length * 3.8 + 4;
  };
  if (doc.terms_and_conditions) block("Terms & Conditions", doc.terms_and_conditions);
  const noteText = doc.notes && doc.notes !== doc.terms_and_conditions ? doc.notes : "We value your business and trust.";
  block("Note", noteText);

  pdf.setDrawColor(220, 220, 225).line(MARGIN, y, PAGE_WIDTH - MARGIN, y); y += 5;
  pdf.setFont("helvetica", "normal").setFontSize(6.5).setTextColor(...MUTED);
  pdf.text("This is a computer-generated document and does not require a physical signature.", PAGE_WIDTH / 2, y, { align: "center" });

  return pdf;
}

export async function downloadBillingDocumentPdf(args: GenerateArgs) {
  const pdf = await buildBillingDocumentPdf(args);
  pdf.save(`${args.doc.doc_number}.pdf`);
}
