// crm-cron worker — invokes one Supabase edge function on a Cron Trigger.
//
// One Worker per scheduled job (so a slow/failing function can't affect the
// others). Replaces the pg_cron + pg_net path, which suffered intermittent DNS
// resolution failures from inside the database. Cloudflare's edge resolves DNS
// reliably, so delivery is dependable.
//
// Bindings (set by deploy.mjs):
//   TARGET_FN                  plain_text  — edge function slug, e.g. "queue-processor"
//   SUPABASE_URL               plain_text  — project URL
//   TARGET_BODY                plain_text  — JSON request body (default "{}")
//   SUPABASE_SERVICE_ROLE_KEY  secret      — auth for the function gateway
//
// workers.dev is intentionally NOT enabled for these workers, so the fetch
// handler is not publicly reachable; the cron trigger is the only entry point.

async function invokeTarget(env) {
  const url = `${env.SUPABASE_URL}/functions/v1/${env.TARGET_FN}`;
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: env.TARGET_BODY || "{}",
  });
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(invokeTarget(env));
  },
  async fetch(_req, env) {
    // Identity only — never returns the service-role key.
    return new Response(JSON.stringify({ worker: "crm-cron", target: env.TARGET_FN }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  },
};
