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

    const { importId, records, tableName } = await req.json();

    if (!importId || !records || !tableName) {
      throw new Error('Missing required fields: importId, records, tableName');
    }

    console.log(`[PROCESS-IMPORT-HYBRID] Processing ${records.length} records for import ${importId}`);

    // Update status to processing
    await supabase
      .from('bulk_import_history')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', importId);

    // Bulk insert records into staging table
    const stagingRecords = records.map((record: any, index: number) => ({
      import_id: importId,
      row_number: index + 1,
      raw_data: record,
      processed: false
    }));

    // Insert in chunks to avoid payload limits
    const STAGING_CHUNK_SIZE = 1000;
    for (let i = 0; i < stagingRecords.length; i += STAGING_CHUNK_SIZE) {
      const chunk = stagingRecords.slice(i, i + STAGING_CHUNK_SIZE);
      const { error: stagingError } = await supabase
        .from('import_staging')
        .insert(chunk);

      if (stagingError) {
        console.error('Error inserting staging records:', stagingError);
        throw new Error('Failed to stage records for processing');
      }
    }

    console.log(`[PROCESS-IMPORT-HYBRID] Staged ${records.length} records, calling PostgreSQL function`);

    // Call the PostgreSQL function to process the batch
    const { data: result, error: rpcError } = await supabase.rpc('process_bulk_import_batch', {
      p_import_id: importId,
      p_table_name: tableName,
      p_org_id: profile.org_id,
      p_user_id: user.id
    });

    if (rpcError) {
      console.error('Error processing batch:', rpcError);
      
      // Update status to failed
      await supabase
        .from('bulk_import_history')
        .update({ 
          status: 'failed',
          error_log: [{ error: rpcError.message }],
          updated_at: new Date().toISOString()
        })
        .eq('id', importId);

      throw new Error('Failed to process import batch');
    }

    console.log(`[PROCESS-IMPORT-HYBRID] Result:`, result);

    // Determine final status
    const processed = result.processed || 0;
    const inserted = result.inserted || 0;
    const failed = result.failed || 0;
    const skipped = result.skipped || 0;

    let finalStatus = 'completed';
    if (failed > 0 && inserted === 0) {
      finalStatus = 'failed';
    } else if (failed > 0) {
      finalStatus = 'partial';
    }

    // Update import history with results
    await supabase
      .from('bulk_import_history')
      .update({
        status: finalStatus,
        processed_records: processed,
        successful_records: inserted,
        failed_records: failed,
        current_batch: 1,
        error_log: result.errors || [],
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', importId);

    console.log(`[PROCESS-IMPORT-HYBRID] Import ${importId} completed: ${inserted} inserted, ${skipped} skipped, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        importId,
        processed,
        inserted,
        skipped,
        failed,
        status: finalStatus
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[PROCESS-IMPORT-HYBRID] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
