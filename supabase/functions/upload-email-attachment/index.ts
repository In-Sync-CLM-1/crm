import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { uploadToFilesR2, deleteFromFilesR2 } from "../_shared/r2Files.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    if (req.method === "DELETE") {
      const { path } = await req.json();
      if (!path) {
        return new Response(JSON.stringify({ error: "path required" }), {
          status: 400, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      await deleteFromFilesR2(`email-attachments/${path}`);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const form  = await req.formData();
    const file  = form.get("file") as File | null;
    const orgId = form.get("orgId") as string | null;

    if (!file || !orgId) {
      return new Response(JSON.stringify({ error: "file and orgId required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const path = `${orgId}/${crypto.randomUUID()}.${ext}`;
    const buf = await file.arrayBuffer();
    const mimeType = file.type || "application/octet-stream";

    const url = await uploadToFilesR2(`email-attachments/${path}`, buf, mimeType);

    return new Response(JSON.stringify({ url, path }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
