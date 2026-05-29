const BASE_URL = 'https://mlvgqudcwlkolsbighnn.supabase.co/functions/v1/temp-ga4-auth';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const code = url.searchParams.get('code');

  // Google redirects here with ?code=xxx — show it to the user
  if (code) {
    return new Response(
      `<html><body><h2>Authorization code:</h2><pre style="background:#f0f0f0;padding:16px;word-break:break-all;">${code}</pre><p>Paste this code back to Claude Code.</p></body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  // Step 1: generate auth URL
  if (action === 'url') {
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
    const redirectUri = BASE_URL; // no query string — matches what Google allows
    const scope = 'https://www.googleapis.com/auth/analytics.readonly';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
    return new Response(JSON.stringify({ url: authUrl, redirect_uri: redirectUri }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Step 2: exchange code for tokens
  if (action === 'exchange') {
    const { code: authCode } = await req.json();
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: authCode,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: BASE_URL,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await res.json();
    return new Response(JSON.stringify(tokens), { headers: { 'Content-Type': 'application/json' } });
  }

  return new Response('Send ?action=url to get the auth link', { status: 200 });
});
