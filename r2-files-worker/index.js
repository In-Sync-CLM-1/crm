const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-upload-secret",
};

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
      const objKey = url.searchParams.get("key");
      if (!objKey) return new Response("Missing key", { status: 400, headers: CORS });

      const contentType = request.headers.get("content-type") || "application/octet-stream";
      await env.BUCKET.put(objKey, request.body, { httpMetadata: { contentType } });

      const publicUrl = `${url.origin}/${objKey}`;
      return new Response(JSON.stringify({ key: objKey, url: publicUrl }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // DELETE /{key}  — remove a file
    if (request.method === "DELETE" && key) {
      const secret = request.headers.get("x-upload-secret");
      if (!secret || secret !== env.UPLOAD_SECRET) {
        return new Response("Unauthorized", { status: 401, headers: CORS });
      }
      await env.BUCKET.delete(key);
      return new Response(JSON.stringify({ deleted: key }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // GET /{key}  — serve the file
    if (request.method === "GET" && key) {
      const obj = await env.BUCKET.get(key);
      if (!obj) return new Response("Not found", { status: 404, headers: CORS });

      const ct = obj.httpMetadata?.contentType || "application/octet-stream";
      return new Response(obj.body, {
        headers: { ...CORS, "Content-Type": ct, "Cache-Control": "private, max-age=3600" },
      });
    }

    return new Response("Not found", { status: 404, headers: CORS });
  },
};
