import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { logEdgeError, logStep } from '../_shared/errorLogger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep('INIT', { function: 'bulk-import-trigger', timestamp: new Date().toISOString() });
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization')!;
    
    // Extract JWT token from Authorization header
    logStep('AUTH_EXTRACT', { hasAuthHeader: !!authHeader });
    const jwt = authHeader?.replace('Bearer ', '');
    if (!jwt) {
      await logEdgeError({
        function_name: 'bulk-import-trigger',
        step: 'auth_missing_jwt',
        error: new Error('Missing JWT token'),
        details: {}
      });
      return new Response(JSON.stringify({ error: 'Missing authorization token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Create client for authentication
    logStep('AUTH_CLIENT_CREATE', {});
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    
    // Create admin client for database operations
    const supabaseAdmin = getSupabaseClient();

    // Authenticate user by passing JWT directly to getUser
    logStep('AUTH_VERIFY', { jwtLength: jwt.length });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(jwt);
    if (authError || !user) {
      await logEdgeError({
        function_name: 'bulk-import-trigger',
        step: 'auth_failed',
        error: authError || new Error('No user returned'),
        details: {}
      });
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    logStep('AUTH_SUCCESS', { userId: user.id, email: user.email });

    logStep('REQUEST_PARSE', {});
    const { importJobId } = await req.json();
    
    if (!importJobId) {
      await logEdgeError({
        function_name: 'bulk-import-trigger',
        step: 'request_validation',
        error: new Error('Missing importJobId'),
        details: { userId: user.id }
      });
      return new Response(JSON.stringify({ error: 'Missing importJobId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    logStep('JOB_FETCH', { importJobId, userId: user.id });

    // Fetch import job
    const { data: importJob, error: jobError } = await supabaseAdmin
      .from('import_jobs')
      .select('*')
      .eq('id', importJobId)
      .single();

    if (jobError || !importJob) {
      await logEdgeError({
        function_name: 'bulk-import-trigger',
        step: 'job_fetch_failed',
        error: jobError || new Error('Job not found'),
        details: { importJobId, userId: user.id }
      });
      return new Response(JSON.stringify({ error: 'Import job not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    logStep('JOB_FOUND', { 
      importJobId,
      fileName: importJob.file_name,
      orgId: importJob.org_id,
      totalRows: importJob.total_rows,
      importType: importJob.import_type
    });

    // Update job status to processing
    logStep('JOB_STATUS_UPDATE', { importJobId, newStatus: 'processing' });
    const { error: updateError } = await supabaseAdmin
      .from('import_jobs')
      .update({
        status: 'processing',
        current_stage: 'downloading',
        started_at: new Date().toISOString(),
        stage_details: { message: 'Starting import...' }
      })
      .eq('id', importJobId);

    if (updateError) {
      await logEdgeError({
        function_name: 'bulk-import-trigger',
        step: 'job_update_failed',
        error: updateError,
        details: { importJobId, orgId: importJob.org_id, userId: user.id }
      });
      return new Response(JSON.stringify({ error: 'Failed to update job status' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fire-and-forget: Trigger background processing
    logStep('BACKGROUND_TRIGGER', { importJobId, targetFunction: 'process-bulk-import' });
    fetch(`${supabaseUrl}/functions/v1/process-bulk-import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({ importJobId })
    }).catch(error => {
      logEdgeError({
        function_name: 'bulk-import-trigger',
        step: 'background_trigger_failed',
        error,
        details: { importJobId, orgId: importJob.org_id }
      });
    });

    logStep('TRIGGER_SUCCESS', { importJobId, responseStatus: 202 });
    return new Response(JSON.stringify({
      success: true,
      message: 'Import started in background',
      jobId: importJobId
    }), {
      status: 202,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[ERROR] Trigger function failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});