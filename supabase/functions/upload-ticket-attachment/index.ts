import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { uploadToFilesR2 } from "../_shared/r2Files.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const form     = await req.formData();
    const file     = form.get("file") as File | null;
    const orgId    = form.get("orgId") as string | null;
    const ticketId = form.get("ticketId") as string | null;

    if (!file || !orgId || !ticketId) {
      return new Response(JSON.stringify({ error: "file, orgId and ticketId required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const path = `${orgId}/${ticketId}/${Date.now()}_${file.name}`;
    const buf = await file.arrayBuffer();
    const mimeType = file.type || "application/octet-stream";

    const url = await uploadToFilesR2(`ticket-attachments/${path}`, buf, mimeType);

    return new Response(JSON.stringify({ url }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
