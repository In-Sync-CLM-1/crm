/**
 * Shared Google Ads API v21 auth + request helpers. Extracted from the
 * OAuth/GAQL pattern already proven in mkt-google-ads-sync and the mutate
 * pattern in mkt-google-ads-campaign-control, so the new campaign-creation
 * path (mkt-google-ads-launch) doesn't duplicate either.
 */
const API_VERSION = 'v21';

export interface GoogleAdsConfig {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export function loadGoogleAdsConfig(): GoogleAdsConfig | null {
  const developerToken = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN');
  const clientId = Deno.env.get('GOOGLE_ADS_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_ADS_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GOOGLE_ADS_REFRESH_TOKEN');
  if (!developerToken || !clientId || !clientSecret || !refreshToken) return null;
  return { developerToken, clientId, clientSecret, refreshToken };
}

export async function getGoogleAccessToken(config: GoogleAdsConfig): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) throw new Error(`Google OAuth error: ${await response.text()}`);
  const data = await response.json();
  return data.access_token;
}

function headersFor(accessToken: string, developerToken: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json',
  };
  const loginCustomerId = Deno.env.get('GOOGLE_ADS_LOGIN_CUSTOMER_ID')?.replace(/-/g, '');
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;
  return headers;
}

/**
 * POST to a Google Ads resource `:mutate` endpoint (campaignBudgets,
 * campaigns, adGroups, adGroupCriteria, adGroupAds, campaignCriteria, ...).
 * Returns the parsed JSON body; throws with the full error text on failure —
 * Google Ads mutate errors are detailed and worth surfacing verbatim rather
 * than swallowing, since a misconfigured field here means real ad spend.
 */
export async function mutateGoogleAds(
  accessToken: string,
  developerToken: string,
  customerId: string,
  resource: string,
  operations: Array<Record<string, unknown>>,
): Promise<{ results: Array<{ resourceName: string }> }> {
  const cleanId = customerId.replace(/-/g, '');
  const res = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers/${cleanId}/${resource}:mutate`,
    {
      method: 'POST',
      headers: headersFor(accessToken, developerToken),
      body: JSON.stringify({ operations }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Ads ${resource}:mutate ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

/** Extracts the numeric id from a Google Ads resourceName (".../campaigns/123" -> "123"). */
export function resourceId(resourceName: string): string {
  return resourceName.split('/').pop() ?? resourceName;
}
