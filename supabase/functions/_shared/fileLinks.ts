/**
 * Customer files (client documents, invoices, accounting receipts) live in the
 * crm-invoices R2 bucket behind r2-invoice-worker. The worker only serves a file
 * when the link carries a valid signature that has not expired, so a stored file
 * address on its own opens nothing.
 *
 * Signature: HMAC-SHA256 over "<key>\n<expiry unix seconds>" with FILE_LINK_SECRET
 * (the same secret is set on the worker as LINK_SECRET).
 */
const DEFAULT_SECONDS = 60 * 60; // 1 hour

function workerOrigin(): string | null {
  const u = Deno.env.get('R2_INVOICE_WORKER_URL');
  if (!u) return null;
  try { return new URL(u).origin; } catch { return null; }
}

/** True when the address points at the private customer-file store. */
export function isPrivateFileUrl(stored: string | null | undefined): boolean {
  if (!stored) return false;
  const origin = workerOrigin();
  try {
    const u = new URL(stored);
    return (origin !== null && u.origin === origin) || u.hostname.startsWith('crm-invoice-store.');
  } catch {
    return false;
  }
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Returns a link that works for `seconds`; other addresses are returned unchanged. */
export async function signFileUrl(stored: string, seconds = DEFAULT_SECONDS): Promise<string> {
  if (!isPrivateFileUrl(stored)) return stored;
  const secret = Deno.env.get('FILE_LINK_SECRET');
  if (!secret) throw new Error('FILE_LINK_SECRET not configured');
  const u = new URL(stored);
  u.search = '';
  const key = decodeURIComponent(u.pathname.replace(/^\//, ''));
  const exp = Math.floor(Date.now() / 1000) + seconds;
  u.searchParams.set('exp', String(exp));
  u.searchParams.set('sig', await hmacHex(secret, `${key}\n${exp}`));
  return u.toString();
}

/** Server-side download of a stored file (signs private links first). */
export async function fetchStoredFile(stored: string): Promise<Response> {
  return await fetch(await signFileUrl(stored, 5 * 60));
}
