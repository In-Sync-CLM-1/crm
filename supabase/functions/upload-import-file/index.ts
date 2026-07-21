import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { uploadToFilesR2 } from "../_shared/r2Files.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const path = form.get("path") as string | null;

    if (!file || !path) {
      return new Response(JSON.stringify({ error: "file and path required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const safePath = path.replace(/^\/+/, "").replace(/\.\.+/g, "");
    const buf = await file.arrayBuffer();
    const mimeType = file.type || "application/octet-stream";

    await uploadToFilesR2(`import-files/${safePath}`, buf, mimeType);

    return new Response(JSON.stringify({ path: safePath }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
