import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';

let _supabaseClient: SupabaseClient | null = null;

/**
 * Get or create a shared Supabase client instance with connection pooling
 * This prevents creating multiple clients in edge functions
 */
export function getSupabaseClient(): SupabaseClient {
  if (!_supabaseClient) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    _supabaseClient = createClient(supabaseUrl, supabaseKey, {
      db: { schema: 'public' },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          'x-connection-pool': 'true',
          'x-client-info': 'supabase-edge-functions'
        }
      }
    });

    console.log('[SharedClient] Supabase client initialized with connection pooling');
  }

  return _supabaseClient;
}

/**
 * Reset the client (useful for testing or forced reconnection)
 */
export function resetSupabaseClient(): void {
  _supabaseClient = null;
  console.log('[SharedClient] Client reset');
}
