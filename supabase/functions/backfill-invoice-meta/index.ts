import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const PARSE_PROMPT = `Extract these four fields from this invoice/receipt document:
- party: the vendor or supplier name (who issued the invoice)
- date: the invoice date in YYYY-MM-DD format
- description: a short description of what was purchased (10 words max)
- amount: the total payable amount as a number (no currency symbol)

Return ONLY a JSON object, e.g.: {"party":"ABC Pvt Ltd","date":"2026-06-18","description":"Cloud hosting services","amount":5900.00}
If a field is missing, use null.`;

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

serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const workerUrl    = Deno.env.get("R2_INVOICE_WORKER_URL")!;
  const uploadSecret = Deno.env.get("R2_INVOICE_UPLOAD_SECRET")!;

  // All invoice entries not yet on R2 (Supabase storage URL contains "supabase.co")
  const { data: entries, error } = await supabase
    .from("journal_entries")
    .select("id, invoice_url")
    .not("invoice_url", "is", null)
    .like("invoice_url", "%supabase.co%");

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const results: Array<{ id: string; status: string; party?: unknown }> = [];

  for (const entry of (entries ?? [])) {
    try {
      // Extract storage path: everything after /accounting-invoices/
      const storagePath = entry.invoice_url.split("/accounting-invoices/")[1];
      if (!storagePath) { results.push({ id: entry.id, status: "skip:no_path" }); continue; }

      // Download from Supabase private storage using service role
      const { data: blob, error: dlErr } = await supabase.storage
        .from("accounting-invoices")
        .download(storagePath);
      if (dlErr || !blob) { results.push({ id: entry.id, status: `dl_err:${dlErr?.message}` }); continue; }

      const ext  = storagePath.split(".").pop()?.toLowerCase() ?? "pdf";
      const mime = ext === "pdf" ? "application/pdf"
        : ext === "png"  ? "image/png"
        : ext === "webp" ? "image/webp"
        : "image/jpeg";

      const buf = await blob.arrayBuffer();

      // Upload to R2 via Worker
      const r2Key = storagePath; // keep same path structure
      const uploadRes = await fetch(`${workerUrl}/upload?key=${encodeURIComponent(r2Key)}`, {
        method: "PUT",
        headers: { "x-upload-secret": uploadSecret, "content-type": mime },
        body: buf,
      });
      if (!uploadRes.ok) { results.push({ id: entry.id, status: `r2_err:${uploadRes.status}` }); continue; }
      const { url: r2Url } = await uploadRes.json() as { key: string; url: string };

      // Parse with AI
      const b64 = base64Encode(buf);
      let parsed = await parseWithGroq(b64, mime);
      if (!parsed) parsed = await parseWithAnthropic(b64, mime);

      // Update DB: new R2 URL + parsed metadata
      await supabase.from("journal_entries").update({
        invoice_url:         r2Url,
        invoice_party:       parsed?.party        ?? null,
        invoice_date:        parsed?.date         ?? null,
        invoice_description: parsed?.description  ?? null,
        invoice_amount:      parsed?.amount       ?? null,
      }).eq("id", entry.id);

      results.push({ id: entry.id, status: "ok", party: parsed?.party });
    } catch (e) {
      results.push({ id: entry.id, status: `error:${e}` });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
