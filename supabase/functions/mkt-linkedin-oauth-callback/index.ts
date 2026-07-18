/**
 * mkt-linkedin-oauth-callback — LinkedIn OAuth redirect target for BOTH apps.
 *
 * Two connections live side by side on mkt_linkedin_config:
 *
 *  • ORG (preferred): the "In-Sync-Org" app with Community Management API
 *    approval posts as the In-Sync company page. Open this function with
 *    ?connect=org to start consent (302 to LinkedIn, state=org). The token
 *    exchange returns a refresh_token (~365d), so after this one consent the
 *    system renews itself (see _shared/linkedinAuth.ts).
 *
 *  • MEMBER (legacy fallback): the original app posts as the member profile.
 *    ~60-day tokens, no refresh_token, manual re-consent via the old link.
 *
 * LinkedIn redirects back here with ?code= (+ the state we sent); the flow is
 * told apart by state=org vs anything else.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const REDIRECT_URI = 'https://mlvgqudcwlkolsbighnn.supabase.co/functions/v1/mkt-linkedin-oauth-callback';
const LINKEDIN_VERSION = '202503';
const ORG_SCOPES = 'w_organization_social r_organization_social rw_organization_admin';

function html(body: string, status = 200) {
  return new Response(`<!doctype html><html><body style="font-family:sans-serif;padding:40px;text-align:center">${body}</body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html' },
  });
}

async function exchangeCode(code: string, clientId: string, clientSecret: string) {
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json();
}

function supabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

async function activeConfig(supabase: ReturnType<typeof supabaseClient>) {
  const { data } = await supabase
    .from('mkt_linkedin_config')
    .select('id, linkedin_org_id')
    .eq('active', true)
    .maybeSingle();
  return data;
}

// ── Org flow ──────────────────────────────────────────────────────────────────

async function handleOrgCallback(code: string) {
  const clientId = Deno.env.get('LINKEDIN_ORG_CLIENT_ID');
  const clientSecret = Deno.env.get('LINKEDIN_ORG_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return html(`<h2>LINKEDIN_ORG_CLIENT_ID / LINKEDIN_ORG_CLIENT_SECRET secrets not set</h2>`, 500);
  }

  const tokenData = await exchangeCode(code, clientId, clientSecret);
  const accessToken: string = tokenData.access_token;
  const expiresInSec: number = tokenData.expires_in ?? 5_184_000;
  const refreshToken: string | null = tokenData.refresh_token ?? null;
  const refreshExpiresInSec: number | null = tokenData.refresh_token_expires_in ?? null;

  // Resolve which organizations this token can administer.
  const aclRes = await fetch(
    'https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED',
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'LinkedIn-Version': LINKEDIN_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      signal: AbortSignal.timeout(15_000),
    },
  );

  let orgUrns: string[] = [];
  if (aclRes.ok) {
    const aclData = await aclRes.json();
    orgUrns = (aclData?.elements ?? [])
      .map((el: Record<string, unknown>) => el.organization as string)
      .filter(Boolean);
  } else {
    console.warn(`[linkedin-oauth] organizationAcls ${aclRes.status}: ${await aclRes.text()}`);
  }

  const supabase = supabaseClient();
  const config = await activeConfig(supabase);
  if (!config) return html(`<h2>No active mkt_linkedin_config row found</h2>`, 500);

  // Prefer the org already on file (In-Sync, 35932282); else take the first
  // one the token administers.
  const knownUrn = config.linkedin_org_id ? `urn:li:organization:${config.linkedin_org_id}` : null;
  const orgUrn = (knownUrn && orgUrns.includes(knownUrn)) ? knownUrn : (orgUrns[0] ?? knownUrn);
  if (!orgUrn) {
    return html(`<h2>No administered company page found</h2><p>The token exchange worked but LinkedIn returned no organization this account administers.</p>`, 500);
  }
  const orgId = orgUrn.split(':').pop()!;

  await supabase
    .from('mkt_linkedin_config')
    .update({
      linkedin_org_id: orgId,
      org_access_token: accessToken,
      org_token_expires_at: new Date(Date.now() + expiresInSec * 1000).toISOString(),
      org_refresh_token: refreshToken,
      org_refresh_expires_at: refreshExpiresInSec
        ? new Date(Date.now() + refreshExpiresInSec * 1000).toISOString()
        : null,
    })
    .eq('id', config.id);

  return html(
    `<h2>Company page connected</h2>` +
    `<p>Posting as: ${orgUrn}</p>` +
    `<p>Access token valid until ${new Date(Date.now() + expiresInSec * 1000).toDateString()}.</p>` +
    (refreshToken
      ? `<p>Refresh token stored — renews automatically${refreshExpiresInSec ? ` until ${new Date(Date.now() + refreshExpiresInSec * 1000).toDateString()}` : ''}.</p>`
      : `<p style="color:#b45309">No refresh token returned — manual reconnect will be needed when the access token expires.</p>`) +
    `<p>You can close this tab.</p>`,
  );
}

// ── Member flow (legacy) ──────────────────────────────────────────────────────

async function handleMemberCallback(code: string) {
  const clientId = Deno.env.get('LINKEDIN_CLIENT_ID')!;
  const clientSecret = Deno.env.get('LINKEDIN_CLIENT_SECRET')!;

  const tokenData = await exchangeCode(code, clientId, clientSecret);
  const accessToken: string = tokenData.access_token;
  const expiresInSec: number = tokenData.expires_in ?? 5_184_000;

  const userRes = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });

  let memberUrn: string | null = null;
  if (userRes.ok) {
    const userData = await userRes.json();
    if (userData.sub) memberUrn = `urn:li:person:${userData.sub}`;
  }

  const supabase = supabaseClient();
  const config = await activeConfig(supabase);
  if (!config) return html(`<h2>No active mkt_linkedin_config row found</h2>`, 500);

  await supabase
    .from('mkt_linkedin_config')
    .update({
      member_access_token: accessToken,
      member_urn: memberUrn,
      member_token_expires_at: new Date(Date.now() + expiresInSec * 1000).toISOString(),
    })
    .eq('id', config.id);

  return html(`<h2>LinkedIn connected</h2><p>Member: ${memberUrn ?? '(URN not resolved — userinfo call failed, check openid/profile scope)'}</p><p>Token valid until ${new Date(Date.now() + expiresInSec * 1000).toDateString()}.</p><p>You can close this tab.</p>`);
}

// ── Entry ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const connect = url.searchParams.get('connect');
  const error = url.searchParams.get('error_description') || url.searchParams.get('error');

  // Consent starter: /mkt-linkedin-oauth-callback?connect=org → 302 to LinkedIn
  if (connect === 'org') {
    const clientId = Deno.env.get('LINKEDIN_ORG_CLIENT_ID');
    if (!clientId) return html(`<h2>LINKEDIN_ORG_CLIENT_ID secret not set</h2>`, 500);
    const consent = new URL('https://www.linkedin.com/oauth/v2/authorization');
    consent.searchParams.set('response_type', 'code');
    consent.searchParams.set('client_id', clientId);
    consent.searchParams.set('redirect_uri', REDIRECT_URI);
    consent.searchParams.set('state', 'org');
    consent.searchParams.set('scope', ORG_SCOPES);
    return Response.redirect(consent.toString(), 302);
  }

  if (error) return html(`<h2>LinkedIn declined the request</h2><p>${error}</p>`, 400);
  if (!code) return html(`<h2>Missing authorization code</h2>`, 400);

  try {
    return state === 'org' ? await handleOrgCallback(code) : await handleMemberCallback(code);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return html(`<h2>Unexpected error</h2><pre>${msg}</pre>`, 500);
  }
});
