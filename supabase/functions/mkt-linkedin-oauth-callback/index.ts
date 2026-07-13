/**
 * mkt-linkedin-oauth-callback — LinkedIn OAuth redirect target.
 *
 * LinkedIn's access tokens expire every ~60 days and there is no refresh_token
 * on this app tier, so reconnecting means: open the consent link, approve, get
 * redirected here with ?code=. This exchanges the code for a fresh access
 * token, resolves the member's own URN (posting happens as a member — the
 * LinkedIn app never got Community Management API approval for organization
 * posting), and writes both into mkt_linkedin_config. No secret rotation, no
 * redeploy — mkt-blog-poster / mkt-linkedin-engagement-tracker read the token
 * straight from that row.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const REDIRECT_URI = 'https://mlvgqudcwlkolsbighnn.supabase.co/functions/v1/mkt-linkedin-oauth-callback';

function html(body: string, status = 200) {
  return new Response(`<!doctype html><html><body style="font-family:sans-serif;padding:40px;text-align:center">${body}</body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html' },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error_description') || url.searchParams.get('error');

  if (error) return html(`<h2>LinkedIn declined the request</h2><p>${error}</p>`, 400);
  if (!code) return html(`<h2>Missing authorization code</h2>`, 400);

  const clientId = Deno.env.get('LINKEDIN_CLIENT_ID')!;
  const clientSecret = Deno.env.get('LINKEDIN_CLIENT_SECRET')!;

  try {
    // 1. Exchange code for access token
    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
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

    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      return html(`<h2>Token exchange failed</h2><pre>${t}</pre>`, 500);
    }

    const tokenData = await tokenRes.json();
    const accessToken: string = tokenData.access_token;
    const expiresInSec: number = tokenData.expires_in ?? 5_184_000; // default 60d

    // 2. Resolve the member's own URN via OpenID userinfo
    const userRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });

    let memberUrn: string | null = null;
    if (userRes.ok) {
      const userData = await userRes.json();
      if (userData.sub) memberUrn = `urn:li:person:${userData.sub}`;
    }

    // 3. Store on the active config row
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: config } = await supabase
      .from('mkt_linkedin_config')
      .select('id')
      .eq('active', true)
      .maybeSingle();

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

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return html(`<h2>Unexpected error</h2><pre>${msg}</pre>`, 500);
  }
});
