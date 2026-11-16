const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-upload-secret",
};

async function validLink(env, key, params) {
  const exp = Number(params.get("exp"));
  const sig = params.get("sig") || "";
  if (!env.LINK_SECRET || !Number.isFinite(exp) || exp < Date.now() / 1000 || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.LINK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const bytes = new Uint8Array(sig.match(/../g).map((h) => parseInt(h, 16)));
  return crypto.subtle.verify("HMAC", k, bytes, new TextEncoder().encode(`${key}\n${exp}`));
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const key = url.pathname.replace(/^\//, "");

    // PUT /upload  — upload a file, return { key, url }
    if (request.method === "PUT" && key === "upload") {
      const secret = request.headers.get("x-upload-secret");
      if (!secret || secret !== env.UPLOAD_SECRET) {
        return new Response("Unauthorized", { status: 401, headers: CORS });
      }
      // Key is passed via query string: ?key=orgId/filename
      const objKey = url.searchParams.get("key");
      if (!objKey) return new Response("Missing key", { status: 400, headers: CORS });

      const contentType = request.headers.get("content-type") || "application/octet-stream";
      await env.BUCKET.put(objKey, request.body, { httpMetadata: { contentType } });

      const publicUrl = `${url.origin}/${objKey}`;
      return new Response(JSON.stringify({ key: objKey, url: publicUrl }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // GET /{key}?exp=…&sig=…  — serve the file, only through a link that has not expired.
    // Links are made by the file-link server function for signed-in staff (code audit 2026-11-15).
    if ((request.method === "GET" || request.method === "HEAD") && key) {
      if (!(await validLink(env, decodeURIComponent(key), url.searchParams))) {
        return new Response("This link has expired. Open the file again from CRM.", { status: 403, headers: CORS });
      }
      const obj = await env.BUCKET.get(decodeURIComponent(key));
      if (!obj) return new Response("Not found", { status: 404, headers: CORS });

      const ct = obj.httpMetadata?.contentType || "application/octet-stream";
      return new Response(request.method === "HEAD" ? null : obj.body, {
        headers: { ...CORS, "Content-Type": ct, "Cache-Control": "private, max-age=3600" },
      });
    }

    return new Response("Not found", { status: 404, headers: CORS });
  },
};
