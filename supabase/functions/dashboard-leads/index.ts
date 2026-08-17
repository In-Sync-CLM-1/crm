import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { corsHeaders } from '../_shared/corsHeaders.ts';

/**
 * The five most recent real inbound leads, for the dashboard.
 *
 * Leads do not live in this database — they land in globalcrm's "In-Sync Demo"
 * org through web-lead-intake, so this reads across with the GLOBALCRM_*
 * service credentials. crm's own lead_alert_calls table is not usable for this:
 * it is only written inside the Bolna call path, so while calling is paused it
 * records nothing, and its last row is 31 July.
 *
 * Two families of rows are excluded because they are not inbound interest:
 *   - BD Outreach — firms WE contacted, created by the bd-* pipeline
 *   - bulk imports (ats-*, expense-*, *csv_upload*) — email-campaign lists
 *     loaded in one go, not people who approached us
 *   - seeded demo records, which carry hand-written UUIDs beginning aa00000
 *     (the walkthrough-video hero lead is one). Showing a fabricated lead as a
 *     real one is worse than showing an empty list.
 */
const INSYNC_ORG = '61f7f96d-e80c-4d9b-a765-8eb32bd3c70d';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // verify_jwt is false at the gateway (the publishable key trips its check),
    // so the caller's session is validated here instead — same guard as
    // mkt-ad-funnel. A bare anon key resolves to no user and is rejected.
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user || user.role !== 'authenticated') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = Deno.env.get('GLOBALCRM_SUPABASE_URL');
    const key = Deno.env.get('GLOBALCRM_SERVICE_KEY');
    if (!url || !key) {
      return new Response(JSON.stringify({ error: 'globalcrm credentials not configured', leads: [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const globalcrm = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await globalcrm
      .from('contacts')
      .select('id, first_name, last_name, company, email, source, product, created_at')
      .eq('org_id', INSYNC_ORG)
      .not('source', 'is', null)
      .neq('source', 'BD Outreach')
      .not('source', 'like', 'ats-%')
      .not('source', 'like', 'expense-%')
      .not('source', 'ilike', '%csv_upload%')
      .order('created_at', { ascending: false })
      .limit(15);

    if (error) throw new Error(`globalcrm read failed: ${error.message}`);

    const leads = (data || [])
      .filter((c) => !/^aa0{5}/i.test(String(c.id)))
      .slice(0, 5)
      .map((c) => ({
      id: c.id,
      name: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown',
      company: c.company,
      email: c.email,
      source: c.source,
      product: c.product,
      created_at: c.created_at,
      }));

    return new Response(JSON.stringify({ leads }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message, leads: [] }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
