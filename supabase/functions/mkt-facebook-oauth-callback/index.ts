/**
 * mkt-facebook-oauth-callback — Facebook/Instagram OAuth redirect target.
 *
 * Same shape as mkt-linkedin-oauth-callback: exchanges the consent code for a
 * long-lived Page access token, resolves the linked Instagram Business
 * account, and writes both into mkt_social_config. mkt-social-facebook and
 * mkt-social-instagram read from that row instead of static secrets.
 *
 * Facebook Page tokens minted this way don't expire on a fixed schedule (no
 * ~60-day LinkedIn-style renewal needed) as long as the connection isn't
 * revoked, so this is a one-time setup, not a recurring task.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const REDIRECT_URI = 'https://mlvgqudcwlkolsbighnn.supabase.co/functions/v1/mkt-facebook-oauth-callback';
const FB_API_VERSION = 'v19.0';

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

  if (error) return html(`<h2>Facebook declined the request</h2><p>${error}</p>`, 400);
  if (!code) return html(`<h2>Missing authorization code</h2>`, 400);

  const clientId = Deno.env.get('FB_APP_ID')!;
  const clientSecret = Deno.env.get('FB_APP_SECRET')!;

  try {
    // 1. Exchange code for a short-lived user access token
    const shortTokenUrl = new URL(`https://graph.facebook.com/${FB_API_VERSION}/oauth/access_token`);
    shortTokenUrl.searchParams.set('client_id', clientId);
    shortTokenUrl.searchParams.set('client_secret', clientSecret);
    shortTokenUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    shortTokenUrl.searchParams.set('code', code);

    const shortRes = await fetch(shortTokenUrl.toString(), { signal: AbortSignal.timeout(15_000) });
    if (!shortRes.ok) return html(`<h2>Code exchange failed</h2><pre>${await shortRes.text()}</pre>`, 500);
    const shortData = await shortRes.json();

    // 2. Exchange for a long-lived user access token (~60 days)
    const longTokenUrl = new URL(`https://graph.facebook.com/${FB_API_VERSION}/oauth/access_token`);
    longTokenUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longTokenUrl.searchParams.set('client_id', clientId);
    longTokenUrl.searchParams.set('client_secret', clientSecret);
    longTokenUrl.searchParams.set('fb_exchange_token', shortData.access_token);

    const longRes = await fetch(longTokenUrl.toString(), { signal: AbortSignal.timeout(15_000) });
    if (!longRes.ok) return html(`<h2>Long-lived token exchange failed</h2><pre>${await longRes.text()}</pre>`, 500);
    const longData = await longRes.json();
    const userToken = longData.access_token as string;

    // 3. List Pages this user manages — Page tokens minted from a long-lived
    // user token are themselves long-lived / effectively permanent.
    const pagesRes = await fetch(
      `https://graph.facebook.com/${FB_API_VERSION}/me/accounts?access_token=${encodeURIComponent(userToken)}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!pagesRes.ok) return html(`<h2>Failed to list Pages</h2><pre>${await pagesRes.text()}</pre>`, 500);
    const pagesData = await pagesRes.json();
    const pages: Array<{ id: string; name: string; access_token: string }> = pagesData.data || [];

    let page: { id: string; name: string; access_token: string };
    if (pages.length) {
      // Prefer a page whose name mentions "in-sync"; otherwise take the first.
      page = pages.find((p) => p.name.toLowerCase().includes('in-sync')) || pages[0];
      console.log('[fb-oauth-callback] pages found:', JSON.stringify(pages.map((p) => ({ id: p.id, name: p.name }))));
    } else {
      // This Configuration granted only page-scoped permissions with a single
      // Page asset selected, so Facebook Login for Business handed back a
      // token whose "me" identity IS the Page itself rather than a personal
      // user with a /me/accounts list. Use that identity directly.
      const meRes = await fetch(
        `https://graph.facebook.com/${FB_API_VERSION}/me?fields=id,name&access_token=${encodeURIComponent(userToken)}`,
        { signal: AbortSignal.timeout(15_000) },
      );
      const meData = meRes.ok ? await meRes.json() : {};
      if (!meData.id) return html(`<h2>Could not resolve a Page or user identity from this token</h2>`, 400);
      page = { id: meData.id, name: meData.name ?? '', access_token: userToken };
    }

    // 4. Resolve the linked Instagram Business account, if any
    const igRes = await fetch(
      `https://graph.facebook.com/${FB_API_VERSION}/${page.id}?fields=instagram_business_account&access_token=${encodeURIComponent(page.access_token)}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    const igData = igRes.ok ? await igRes.json() : {};
    const igUserId: string | null = igData?.instagram_business_account?.id || null;

    // 5. Store on the active config row
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: linkedinConfig } = await supabase
      .from('mkt_linkedin_config')
      .select('org_id')
      .eq('active', true)
      .maybeSingle();

    const orgId = linkedinConfig?.org_id;
    if (!orgId) return html(`<h2>Could not resolve org_id</h2><p>No active mkt_linkedin_config row to borrow org_id from.</p>`, 500);

    const { data: existing } = await supabase
      .from('mkt_social_config')
      .select('id')
      .eq('active', true)
      .maybeSingle();

    const row = {
      org_id: orgId,
      fb_page_id: page.id,
      fb_page_name: page.name,
      fb_page_access_token: page.access_token,
      ig_user_id: igUserId,
    };

    if (existing) {
      await supabase.from('mkt_social_config').update(row).eq('id', existing.id);
    } else {
      await supabase.from('mkt_social_config').insert(row);
    }

    const pagesDebug = pages.length
      ? `<p style="color:#666;font-size:13px">All pages this login could see: ${pages.map((p) => `${p.name} (${p.id})`).join(', ')}</p>`
      : '';
    return html(`<h2>Facebook connected</h2><p>Page: ${page.name} (${page.id})</p><p>Instagram: ${igUserId ?? '(no linked Instagram Business account found)'}</p>${pagesDebug}<p>You can close this tab.</p>`);

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return html(`<h2>Unexpected error</h2><pre>${msg}</pre>`, 500);
  }
});
