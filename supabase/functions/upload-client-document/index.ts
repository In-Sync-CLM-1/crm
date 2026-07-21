import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const workerUrl    = Deno.env.get("R2_INVOICE_WORKER_URL")!;
    const uploadSecret = Deno.env.get("R2_INVOICE_UPLOAD_SECRET")!;

    const form     = await req.formData();
    const file     = form.get("file") as File | null;
    const clientId = form.get("clientId") as string | null;
    const path     = form.get("path") as string | null;

    if (!file || (!clientId && !path)) {
      return new Response(JSON.stringify({ error: "file and (clientId or path) required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const safePath = path?.replace(/^\/+/, "").replace(/\.\.+/g, "");
    const key = `client-documents/${safePath || `${clientId}/${Date.now()}.${ext}`}`;
    const buf = await file.arrayBuffer();
    const mimeType = file.type || "application/octet-stream";

    const uploadRes = await fetch(`${workerUrl}/upload?key=${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "x-upload-secret": uploadSecret, "content-type": mimeType },
      body: buf,
    });
    if (!uploadRes.ok) throw new Error(`R2 upload failed: ${uploadRes.status}`);
    const { url } = await uploadRes.json() as { key: string; url: string };

    return new Response(JSON.stringify({ url }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
