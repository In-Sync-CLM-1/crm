import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const PARSE_PROMPT = `Extract these six fields from this invoice/receipt document:
- party: the vendor or supplier name (who issued the invoice)
- date: the invoice date in YYYY-MM-DD format
- description: a short description of what was purchased (10 words max)
- amount: the total payable amount as a number (no currency symbol)
- currency: the 3-letter currency code of the amount (e.g. "USD", "INR", "EUR", "GBP")
- invoice_number: the invoice or receipt number as printed on the document (e.g. "INV-2025-001", "RC-00123"); null if not present

Return ONLY a JSON object, e.g.: {"party":"ABC Pvt Ltd","date":"2026-06-18","description":"Cloud hosting services","amount":59.00,"currency":"USD","invoice_number":"INV-2026-0042"}
If a field is missing, use null.`;

const FALLBACK_RATES: Record<string, number> = { USD: 84, EUR: 91, GBP: 107, AUD: 55, SGD: 63, CAD: 62 };

async function convertToInr(amount: number, currency: string, date: string | null): Promise<number> {
  const cur = (currency ?? "").toUpperCase();
  if (!cur || cur === "INR") return amount;
  try {
    const dateStr = date ?? new Date().toISOString().split("T")[0];
    const res = await fetch(`https://api.frankfurter.app/${dateStr}?from=${cur}&to=INR`);
    if (res.ok) {
      const data = await res.json();
      const rate = data.rates?.INR;
      if (rate) return Math.round(amount * rate * 100) / 100;
    }
  } catch { /* fall through */ }
  return Math.round(amount * (FALLBACK_RATES[cur] ?? 84) * 100) / 100;
}

async function parseWithGroq(b64: string, mime: string): Promise<Record<string, unknown> | null> {
  if (mime === "application/pdf") return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${Deno.env.get("GROQ_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        max_tokens: 300,
        messages: [{ role: "user", content: [
          { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
          { type: "text", text: PARSE_PROMPT },
        ]}],
      }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    const text = d.choices?.[0]?.message?.content ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch { return null; }
}

async function parseWithCerebras(b64: string, mime: string): Promise<Record<string, unknown> | null> {
  // Cerebras' vision model only accepts image formats, not PDF — it 400s on
  // PDF input and we fall through to parseWithAnthropic (Haiku), which is the
  // only provider here that reads real PDF documents natively.
  try {
    const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${Deno.env.get("CEREBRAS_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemma-4-31b",
        max_tokens: 300,
        messages: [{ role: "user", content: [
          { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
          { type: "text", text: PARSE_PROMPT },
        ]}],
      }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    const text = d.choices?.[0]?.message?.content ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch { return null; }
}

async function parseWithAnthropic(b64: string, mime: string): Promise<Record<string, unknown> | null> {
  try {
    const isPdf = mime === "application/pdf";
    const fileBlock = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
      : { type: "image",    source: { type: "base64", media_type: mime,               data: b64 } };
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: [fileBlock, { type: "text", text: PARSE_PROMPT }] }],
      }),
    });
    if (!res.ok) { console.error("Anthropic error", await res.text()); return null; }
    const d = await res.json();
    const text = d.content?.[0]?.text ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch (e) { console.error("Anthropic exception", e); return null; }
}

serve(async (req) => {
  const url    = new URL(req.url);
  const reparse = url.searchParams.get("reparse") === "true";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const workerUrl    = Deno.env.get("R2_INVOICE_WORKER_URL")!;
  const uploadSecret = Deno.env.get("R2_INVOICE_UPLOAD_SECRET")!;

  let entries: Array<{ id: string; invoice_url: string; invoice_date?: string | null }> = [];

  if (reparse) {
    // Re-parse existing R2 invoices to fix currency conversion
    const { data, error } = await supabase
      .from("journal_entries")
      .select("id, invoice_url, invoice_date")
      .not("invoice_url", "is", null)
      .not("invoice_url", "like", "%supabase.co%");
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    entries = data ?? [];
  } else {
    // Original mode: migrate from Supabase storage → R2
    const { data, error } = await supabase
      .from("journal_entries")
      .select("id, invoice_url")
      .not("invoice_url", "is", null)
      .like("invoice_url", "%supabase.co%");
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    entries = data ?? [];
  }

  const results: Array<{ id: string; status: string; party?: unknown; currency?: unknown; inrAmount?: unknown }> = [];

  for (const entry of entries) {
    try {
      let buf: ArrayBuffer;
      let mime: string;

      if (reparse) {
        // Download directly from R2 public URL
        const dlRes = await fetch(entry.invoice_url);
        if (!dlRes.ok) { results.push({ id: entry.id, status: `dl_err:${dlRes.status}` }); continue; }
        buf  = await dlRes.arrayBuffer();
        const ct = dlRes.headers.get("content-type") ?? "";
        mime = ct.startsWith("image/") || ct === "application/pdf" ? ct.split(";")[0].trim() : "application/pdf";
      } else {
        // Extract storage path: everything after /accounting-invoices/
        const storagePath = entry.invoice_url.split("/accounting-invoices/")[1];
        if (!storagePath) { results.push({ id: entry.id, status: "skip:no_path" }); continue; }

        const { data: blob, error: dlErr } = await supabase.storage
          .from("accounting-invoices")
          .download(storagePath);
        if (dlErr || !blob) { results.push({ id: entry.id, status: `dl_err:${dlErr?.message}` }); continue; }

        const ext = storagePath.split(".").pop()?.toLowerCase() ?? "pdf";
        mime = ext === "pdf" ? "application/pdf"
          : ext === "png"  ? "image/png"
          : ext === "webp" ? "image/webp"
          : "image/jpeg";
        buf = await blob.arrayBuffer();

        // Upload to R2
        const r2Key = storagePath;
        const uploadRes = await fetch(`${workerUrl}/upload?key=${encodeURIComponent(r2Key)}`, {
          method: "PUT",
          headers: { "x-upload-secret": uploadSecret, "content-type": mime },
          body: buf,
        });
        if (!uploadRes.ok) { results.push({ id: entry.id, status: `r2_err:${uploadRes.status}` }); continue; }
        const { url: r2Url } = await uploadRes.json() as { key: string; url: string };

        // Parse and update with new R2 URL
        const b64 = base64Encode(buf);
        let parsed = await parseWithGroq(b64, mime);
        if (!parsed) parsed = await parseWithCerebras(b64, mime);
        if (!parsed) parsed = await parseWithAnthropic(b64, mime);

        const rawAmount = typeof parsed?.amount === "number" ? parsed.amount : null;
        const currency  = typeof parsed?.currency === "string" ? parsed.currency.toUpperCase() : null;
        const inrAmount = rawAmount !== null
          ? await convertToInr(rawAmount, currency ?? "USD", parsed?.date as string | null ?? null)
          : null;

        const invoiceNumber = typeof parsed?.invoice_number === "string" && parsed.invoice_number
          ? (parsed.invoice_number as string).trim() : null;

        await supabase.from("journal_entries").update({
          invoice_url:         r2Url,
          invoice_party:       parsed?.party        ?? null,
          invoice_date:        parsed?.date         ?? null,
          invoice_description: parsed?.description  ?? null,
          invoice_amount:      inrAmount,
          invoice_currency:    currency             ?? null,
          invoice_number:      invoiceNumber,
        }).eq("id", entry.id);

        results.push({ id: entry.id, status: "ok", party: parsed?.party, currency, inrAmount });
        continue;
      }

      // Reparse path: re-parse file from R2 and update amounts
      const b64 = base64Encode(buf);
      let parsed = await parseWithGroq(b64, mime);
      if (!parsed) parsed = await parseWithCerebras(b64, mime);
      if (!parsed) parsed = await parseWithAnthropic(b64, mime);

      const rawAmount = typeof parsed?.amount === "number" ? parsed.amount : null;
      const currency  = typeof parsed?.currency === "string" ? parsed.currency.toUpperCase() : null;
      // Use existing invoice_date if AI didn't return one (date already stored)
      const dateForRate = (parsed?.date as string | null) ?? entry.invoice_date ?? null;
      const inrAmount = rawAmount !== null
        ? await convertToInr(rawAmount, currency ?? "USD", dateForRate)
        : null;

      const invoiceNumber = typeof parsed?.invoice_number === "string" && parsed.invoice_number
        ? (parsed.invoice_number as string).trim() : null;

      await supabase.from("journal_entries").update({
        invoice_party:       parsed?.party        ?? null,
        invoice_date:        parsed?.date         ?? null,
        invoice_description: parsed?.description  ?? null,
        invoice_amount:      inrAmount,
        invoice_currency:    currency             ?? null,
        invoice_number:      invoiceNumber,
      }).eq("id", entry.id);

      results.push({ id: entry.id, status: "ok", party: parsed?.party, currency, inrAmount });
    } catch (e) {
      results.push({ id: entry.id, status: `error:${e}` });
    }
  }

  return new Response(JSON.stringify({ mode: reparse ? "reparse" : "migrate", processed: results.length, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
