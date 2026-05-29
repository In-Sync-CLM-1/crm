import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HYBRID_BATCH_SIZE = 5000;

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

    const { tableName, fileName, totalRecords } = await req.json();

    if (!tableName || !fileName || !totalRecords) {
      throw new Error('Missing required fields: tableName, fileName, totalRecords');
    }

    const totalBatches = Math.ceil(totalRecords / HYBRID_BATCH_SIZE);

    // Create import session
    const { data: importSession, error: insertError } = await supabase
      .from('bulk_import_history')
      .insert({
        org_id: profile.org_id,
        user_id: user.id,
        table_name: tableName,
        file_name: fileName,
        total_records: totalRecords,
        total_batches: totalBatches,
        status: 'pending'
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating import session:', insertError);
      throw new Error('Failed to create import session');
    }

    console.log(`[CREATE-IMPORT-SESSION] Created session ${importSession.id} for ${totalRecords} records in ${totalBatches} batches`);

    return new Response(
      JSON.stringify({
        importId: importSession.id,
        totalBatches,
        batchSize: HYBRID_BATCH_SIZE
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[CREATE-IMPORT-SESSION] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
