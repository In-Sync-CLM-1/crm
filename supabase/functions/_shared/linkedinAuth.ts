/**
 * LinkedIn identity resolution — decides whether marketing functions act as
 * the In-Sync company page (Community Management API, "In-Sync-Org" app) or
 * fall back to the member profile (legacy "Share In-Sync Posts" app).
 *
 * Org tokens come with a refresh_token (~365 days), so this helper silently
 * renews the ~60-day access token when it is close to expiry and persists the
 * new one on mkt_linkedin_config — no manual re-consent while the refresh
 * token lives. The member path has no refresh token and still needs manual
 * reconnect via mkt-linkedin-oauth-callback.
 */

const REFRESH_AHEAD_MS = 7 * 24 * 60 * 60 * 1000; // renew when <7 days left

export interface LinkedInIdentity {
  token: string;
  authorUrn: string;
  isOrg: boolean;
}

interface LinkedInConfigRow {
  id: string;
  linkedin_org_id: string | null;
  org_access_token: string | null;
  org_refresh_token: string | null;
  org_token_expires_at: string | null;
  org_refresh_expires_at: string | null;
  member_access_token: string | null;
  member_urn: string | null;
  member_token_expires_at: string | null;
}

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

async function refreshOrgToken(
  supabase: SupabaseLike,
  config: LinkedInConfigRow,
): Promise<string | null> {
  const clientId = Deno.env.get('LINKEDIN_ORG_CLIENT_ID');
  const clientSecret = Deno.env.get('LINKEDIN_ORG_CLIENT_SECRET');
  if (!clientId || !clientSecret || !config.org_refresh_token) return null;
  if (config.org_refresh_expires_at && new Date(config.org_refresh_expires_at) < new Date()) {
    console.warn('[linkedinAuth] org refresh token itself has expired — manual reconnect needed');
    return null;
  }

  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: config.org_refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    console.warn(`[linkedinAuth] org token refresh failed ${res.status}: ${await res.text()}`);
    return null;
  }

  const data = await res.json();
  const accessToken: string = data.access_token;
  const expiresInSec: number = data.expires_in ?? 5_184_000;
  const update: Record<string, unknown> = {
    org_access_token: accessToken,
    org_token_expires_at: new Date(Date.now() + expiresInSec * 1000).toISOString(),
  };
  // Single-app mode: when the member connection shares this app's token
  // (set together during the org consent), keep the mirror in sync.
  if (config.member_access_token && config.member_access_token === config.org_access_token) {
    update.member_access_token = accessToken;
    update.member_token_expires_at = update.org_token_expires_at;
  }
  // LinkedIn may rotate the refresh token; keep whichever we were given last.
  if (data.refresh_token) {
    update.org_refresh_token = data.refresh_token;
    if (data.refresh_token_expires_in) {
      update.org_refresh_expires_at = new Date(Date.now() + data.refresh_token_expires_in * 1000).toISOString();
    }
  }
  await supabase.from('mkt_linkedin_config').update(update).eq('id', config.id);
  console.log('[linkedinAuth] org access token refreshed');
  return accessToken;
}

/**
 * Returns the identity to act as, preferring the company page. Returns null
 * when neither the org nor the member connection is usable.
 */
export async function getLinkedInIdentity(
  supabase: SupabaseLike,
  config: LinkedInConfigRow,
): Promise<LinkedInIdentity | null> {
  if (config.org_access_token && config.linkedin_org_id) {
    const expiresAt = config.org_token_expires_at ? new Date(config.org_token_expires_at).getTime() : 0;
    let token: string | null = config.org_access_token;

    if (expiresAt - Date.now() < REFRESH_AHEAD_MS) {
      const refreshed = await refreshOrgToken(supabase, config);
      if (refreshed) token = refreshed;
      else if (expiresAt < Date.now()) token = null; // expired and unrefreshable
    }

    if (token) {
      return { token, authorUrn: `urn:li:organization:${config.linkedin_org_id}`, isOrg: true };
    }
  }

  if (config.member_access_token && config.member_urn) {
    if (config.member_token_expires_at && new Date(config.member_token_expires_at) < new Date()) {
      return null;
    }
    return { token: config.member_access_token, authorUrn: config.member_urn, isOrg: false };
  }

  return null;
}
