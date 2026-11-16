/**
 * file-link — turns a stored customer-file address into a link that works for
 * one hour. Only signed-in staff get a link, and only for files recorded in
 * their own organisation (client documents, client invoices, invoice imports,
 * accounting receipts). Platform admins may open any organisation's files.
 */
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { getUserFromRequest } from '../_shared/authHelpers.ts';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { isPrivateFileUrl, signFileUrl } from '../_shared/fileLinks.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const SOURCES: Array<{ table: string; column: string }> = [
  { table: 'client_documents', column: 'file_url' },
  { table: 'client_invoices', column: 'file_url' },
  { table: 'invoice_import_items', column: 'file_url' },
  { table: 'journal_entries', column: 'invoice_url' },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let user: { id: string };
  let orgId: string;
  try {
    ({ user, orgId } = await getUserFromRequest(req));
  } catch {
    return json({ error: 'Sign in required' }, 401);
  }

  let url: string | undefined;
  try {
    ({ url } = await req.json());
  } catch { /* handled below */ }
  if (!url || typeof url !== 'string') return json({ error: 'url required' }, 400);

  // Addresses outside the private store (old links, public pages) are returned as they are.
  if (!isPrivateFileUrl(url)) return json({ url });

  const admin = getSupabaseClient();
  const { data: me } = await admin.from('profiles').select('is_platform_admin').eq('id', user.id).maybeSingle();
  const platformAdmin = me?.is_platform_admin === true;

  // Stored addresses never carry a query string; compare without one.
  const plain = url.split('?')[0];
  let allowed = false;
  for (const s of SOURCES) {
    let q = admin.from(s.table).select('org_id').eq(s.column, plain).limit(1);
    if (!platformAdmin) q = q.eq('org_id', orgId);
    const { data, error } = await q;
    if (!error && data && data.length > 0) { allowed = true; break; }
  }
  if (!allowed) return json({ error: 'File not found' }, 404);

  return json({ url: await signFileUrl(plain) });
});
