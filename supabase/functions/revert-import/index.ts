import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Get user's org
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();

    if (!profile?.org_id) {
      throw new Error('User not associated with organization');
    }

    const { importId } = await req.json();

    if (!importId) {
      throw new Error('Missing importId');
    }

    // Verify import belongs to user's org and can be reverted
    const { data: importRecord, error: fetchError } = await supabase
      .from('bulk_import_history')
      .select('*')
      .eq('id', importId)
      .eq('org_id', profile.org_id)
      .single();

    if (fetchError || !importRecord) {
      throw new Error('Import not found');
    }

    if (!importRecord.can_revert) {
      throw new Error('This import cannot be reverted');
    }

    if (importRecord.status === 'reverted') {
      throw new Error('This import has already been reverted');
    }

    console.log(`[REVERT-IMPORT] Reverting import ${importId}`);

    // Call the PostgreSQL function to revert
    const { data: result, error: rpcError } = await supabase.rpc('revert_bulk_import', {
      p_import_id: importId,
      p_org_id: profile.org_id
    });

    if (rpcError) {
      console.error('Error reverting import:', rpcError);
      throw new Error('Failed to revert import');
    }

    if (!result.success) {
      throw new Error(result.error || 'Failed to revert import');
    }

    console.log(`[REVERT-IMPORT] Import ${importId} reverted: ${result.deleted} records deleted`);

    return new Response(
      JSON.stringify({
        success: true,
        deleted: result.deleted
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[REVERT-IMPORT] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
