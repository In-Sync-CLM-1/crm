import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PARSE_PROMPT = `Extract these four fields from this invoice/receipt document:
- party: the vendor or supplier name (who issued the invoice)
- date: the invoice date in YYYY-MM-DD format
- description: a short description of what was purchased (10 words max)
- amount: the total payable amount as a number (no currency symbol)

Return ONLY a JSON object, e.g.: {"party":"ABC Pvt Ltd","date":"2026-06-18","description":"Cloud hosting services","amount":5900.00}
If a field is missing, use null.`;

async function parseWithGroq(base64Data: string, mimeType: string): Promise<Record<string, unknown> | null> {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key || mimeType === "application/pdf") return null; // Groq doesn't support PDFs
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } },
            { type: "text", text: PARSE_PROMPT },
          ],
        }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
}

async function parseWithAnthropic(base64Data: string, mimeType: string): Promise<Record<string, unknown> | null> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return null;
  try {
    const isPdf = mimeType === "application/pdf";
    const fileBlock = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Data } }
      : { type: "image",    source: { type: "base64", media_type: mimeType,            data: base64Data } };
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: [fileBlock, { type: "text", text: PARSE_PROMPT }] }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.content?.[0]?.text ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const workerUrl   = Deno.env.get("R2_INVOICE_WORKER_URL")!;
    const uploadSecret = Deno.env.get("R2_INVOICE_UPLOAD_SECRET")!;

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const journalEntryId = form.get("journal_entry_id") as string | null;

    if (!file || !journalEntryId) {
      return new Response(JSON.stringify({ error: "file and journal_entry_id required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
    const key = `${journalEntryId}_${Date.now()}.${ext}`;
    const buf = await file.arrayBuffer();
    const mimeType = file.type || (ext === "pdf" ? "application/pdf" : "image/jpeg");

    // 1. Upload to R2 via Worker
    const uploadRes = await fetch(`${workerUrl}/upload?key=${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "x-upload-secret": uploadSecret, "content-type": mimeType },
      body: buf,
    });
    if (!uploadRes.ok) throw new Error(`R2 upload failed: ${uploadRes.status}`);
    const { url } = await uploadRes.json() as { key: string; url: string };

    // 2. Parse with AI: Groq first (images only), Anthropic as fallback
    const b64 = base64Encode(buf);
    let parsed = await parseWithGroq(b64, mimeType);
    if (!parsed) parsed = await parseWithAnthropic(b64, mimeType);

    // 3. Patch journal_entry
    const sbUrl  = Deno.env.get("SUPABASE_URL")!;
    const sbKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(sbUrl, sbKey, { global: { headers: { Authorization: authHeader } } });

    await supabase.from("journal_entries").update({
      invoice_url:         url,
      invoice_party:       parsed?.party       ?? null,
      invoice_date:        parsed?.date        ?? null,
      invoice_description: parsed?.description ?? null,
      invoice_amount:      parsed?.amount      ?? null,
    }).eq("id", journalEntryId);

    return new Response(JSON.stringify({ url, parsed }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
