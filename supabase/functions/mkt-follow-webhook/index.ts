/**
 * mkt-follow-webhook — Resend delivery events for the follow-request campaign.
 *
 * This is the campaign's safety valve. Sending happens from in-sync.co.in, the
 * fleet's shared sending domain, so bounces and spam complaints have to be
 * recorded the moment they happen rather than discovered later in an aggregate
 * report. A complaint additionally writes the fleet-wide suppression list, so
 * no other In-Sync marketing path can ever contact that address again.
 *
 * verify_jwt MUST be false — Resend signs with Svix, and the edge gateway would
 * otherwise 401 every call before the signature check ever runs.
 *
 * The Svix secret is base64 after the "whsec_" prefix; the HMAC key is the
 * DECODED bytes. Using the raw string rejects every genuine event.
 *
 * The account this webhook lives on carries mail for the whole In-Sync fleet,
 * so most deliveries it sees belong to other products. Anything whose message
 * id isn't in this campaign is acknowledged and ignored.
 */
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const TABLE = 'mkt_follow_campaign';

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySvix(secret: string, id: string, timestamp: string, payload: string, header: string): Promise<boolean> {
  const keyBytes = b64ToBytes(secret.replace(/^whsec_/, ''));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${payload}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  // svix-signature is space-separated "v1,<sig>" pairs — any match passes.
  return header.split(' ').some((part) => {
    const [version, value] = part.split(',');
    return version === 'v1' && value && timingSafeEqual(value, expected);
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const raw = await req.text();
  // Deliberately its OWN secret, not the shared RESEND_WEBHOOK_SECRET —
  // that one belongs to the inbound-email webhook and each Resend endpoint is
  // signed with a different key, so reusing the name would break both.
  //
  // TWO secrets are accepted because the campaign's sending moved between
  // Resend accounts. Each account signs with its own key, and mail sent before
  // the move keeps reporting deliveries, bounces and complaints from the old
  // one for days afterwards. Accepting only the new key would silently 401
  // every event still in flight for messages already out — and a bounce that
  // never lands is worse than useless, because the delivery-rate maths reads
  // the gap as undelivered and inflates tomorrow's send.
  const secrets = [
    Deno.env.get('FOLLOW_RESEND_WEBHOOK_SECRET'),
    Deno.env.get('FOLLOW_RESEND_WEBHOOK_SECRET_ALT'),
  ].filter((s): s is string => !!s);

  const id = req.headers.get('svix-id');
  const ts = req.headers.get('svix-timestamp');
  const sig = req.headers.get('svix-signature');

  if (secrets.length) {
    if (!id || !ts || !sig) return new Response('Missing signature headers', { status: 401 });
    let valid = false;
    for (const secret of secrets) {
      if (await verifySvix(secret, id, ts, raw, sig).catch(() => false)) { valid = true; break; }
    }
    if (!valid) return new Response('Invalid signature', { status: 401 });
  }

  let evt: { type?: string; data?: Record<string, unknown> };
  try { evt = JSON.parse(raw); } catch { return new Response('Bad JSON', { status: 400 }); }

  const type = evt.type || '';
  const data = evt.data || {};
  const messageId = String((data as { email_id?: string }).email_id || '');
  if (!messageId) return new Response(JSON.stringify({ ignored: 'no email_id' }), { status: 200 });

  const supabase = getSupabaseClient();

  // The message id lands in one of two columns depending on whether this was
  // the first send or the single reminder.
  const { data: rows } = await supabase
    .from(TABLE)
    .select('id,org_id,email,status')
    .or(`resend_message_id.eq.${messageId},reminder_message_id.eq.${messageId}`)
    .limit(1);

  const row = rows && rows.length ? rows[0] : null;
  if (!row) return new Response(JSON.stringify({ ignored: 'not a follow-campaign message' }), { status: 200 });

  const now = new Date().toISOString();
  const terminal = ['unsubscribed', 'complained', 'bounced'].includes(row.status);
  let update: Record<string, unknown> | null = null;

  switch (type) {
    case 'email.delivered':
      update = { delivered_at: now };
      break;

    case 'email.opened':
      // Never overwrite a click with an open — clicking is the stronger signal.
      update = { opened_at: now };
      break;

    case 'email.clicked':
      update = terminal ? { clicked_at: now } : { status: 'clicked', clicked_at: now };
      break;

    case 'email.bounced': {
      const b = (data as { bounce?: { message?: string; type?: string; subType?: string } }).bounce;
      update = {
        status: 'bounced',
        bounced_at: now,
        bounce_reason: String(b?.message || b?.subType || b?.type || 'bounced').slice(0, 300),
      };
      break;
    }

    case 'email.complained': {
      update = { status: 'complained', complained_at: now };
      // A spam complaint is fleet-wide: never contact this address again from
      // any In-Sync marketing surface, not just this campaign.
      await supabase.from('mkt_unsubscribes').upsert(
        {
          org_id: row.org_id,
          email: row.email,
          channel: 'email',
          reason: 'spam_complaint_follow_request',
          unsubscribed_at: now,
          updated_at: now,
        },
        { onConflict: 'org_id,email,channel' },
      );
      break;
    }

    default:
      return new Response(JSON.stringify({ ignored: type }), { status: 200 });
  }

  await supabase.from(TABLE).update(update).eq('id', row.id);
  return new Response(JSON.stringify({ ok: true, type, id: row.id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
