/**
 * Single-use connect links for the LinkedIn and Facebook connections.
 *
 * Only someone with the server key can issue a link (scripts/social-connect-link.mjs):
 * it stores "<flow>.<random>.<expiry unix seconds>" in oauth_state on the active
 * config row and puts the same value in the link. The callback accepts a sign-in
 * only when LinkedIn/Facebook hand that exact value back before it expires, and
 * clears it so the link cannot be used twice. A stranger completing the consent
 * with their own account therefore cannot replace the company connection.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';

export type ConnectTable = 'mkt_linkedin_config' | 'mkt_social_config';

/** The flow name inside a state value ("org", "member", "facebook"), or null. */
export function stateFlow(state: string | null): string | null {
  if (!state) return null;
  const parts = state.split('.');
  return parts.length === 3 ? parts[0] : null;
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True (and the code is used up) when `state` is the one issued for the active row. */
export async function consumeConnectState(
  supabase: SupabaseClient,
  table: ConnectTable,
  state: string | null,
): Promise<boolean> {
  if (!state) return false;
  const parts = state.split('.');
  if (parts.length !== 3) return false;
  const exp = Number(parts[2]);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;

  const { data } = await supabase.from(table).select('id, oauth_state').eq('active', true).maybeSingle();
  const stored = (data as { id?: string; oauth_state?: string | null } | null);
  if (!stored?.id || !stored.oauth_state || !sameText(stored.oauth_state, state)) return false;

  // Clear it only if it is still the same value (two tabs racing cannot both win).
  const { data: cleared } = await supabase
    .from(table)
    .update({ oauth_state: null })
    .eq('id', stored.id)
    .eq('oauth_state', state)
    .select('id');
  return Array.isArray(cleared) && cleared.length === 1;
}
