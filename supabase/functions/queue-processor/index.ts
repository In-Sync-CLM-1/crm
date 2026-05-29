import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QueueJob {
  id: string;
  org_id: string;
  user_id: string;
  operation_type: string;
  payload: any;
  priority: number;
  scheduled_at: string;
}

async function executeOperation(
  supabaseClient: any,
  job: QueueJob
): Promise<any> {
  console.log(`Executing ${job.operation_type} for job ${job.id}`);

  switch (job.operation_type) {
    case 'bulk_whatsapp_send':
      return await executeBulkWhatsApp(supabaseClient, job);
    
    case 'template_sync':
      return await executeTemplateSync(supabaseClient, job);
    
    case 'contact_import':
      return await executeContactImport(supabaseClient, job);
    
    case 'webhook_lead_processing':
      return await executeWebhookLead(supabaseClient, job);
    
    default:
      throw new Error(`Unknown operation type: ${job.operation_type}`);
  }
}

async function executeBulkWhatsApp(supabaseClient: any, job: QueueJob) {
  const { campaign_id } = job.payload;
  
  // Call the bulk-whatsapp-sender function
  const { data, error } = await supabaseClient.functions.invoke('bulk-whatsapp-sender', {
    body: { campaign_id, skip_rate_limit: true }
  });

  if (error) throw error;
  return data;
}

async function executeTemplateSync(supabaseClient: any, job: QueueJob) {
  // Call the sync-gupshup-templates function
  const { data, error } = await supabaseClient.functions.invoke('sync-gupshup-templates', {
    body: { skip_rate_limit: true }
  });

  if (error) throw error;
  return data;
}

async function executeContactImport(supabaseClient: any, job: QueueJob) {
  // Call the queue-manager function
  const { data, error } = await supabaseClient.functions.invoke('queue-manager', {
    body: { ...job.payload, skip_rate_limit: true }
  });

  if (error) throw error;
  return data;
}

async function executeWebhookLead(supabaseClient: any, job: QueueJob) {
  // Process webhook lead
  const { contact_data } = job.payload;
  
  const { data, error } = await supabaseClient
    .from('contacts')
    .insert(contact_data)
    .select()
    .single();

  if (error) throw error;
  return data;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = getSupabaseClient();

    console.log('Queue processor started');

    // Fetch ready jobs (scheduled_at <= now, status = queued)
    const { data: jobs, error: fetchError } = await supabaseClient
      .from('operation_queue')
      .select('*')
      .eq('status', 'queued')
      .lte('scheduled_at', new Date().toISOString())
      .order('priority', { ascending: false })
      .order('scheduled_at', { ascending: true })
      .limit(50);

    if (fetchError) {
      console.error('Error fetching jobs:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${jobs?.length || 0} jobs to process`);

    let processed = 0;
    let failed = 0;

    for (const job of jobs || []) {
      try {
        console.log(`Processing job ${job.id} (${job.operation_type})`);

        // Mark as processing
        await supabaseClient
          .from('operation_queue')
          .update({ 
            status: 'processing', 
            started_at: new Date().toISOString() 
          })
          .eq('id', job.id);

        // Execute the operation
        const result = await executeOperation(supabaseClient, job);

        // Mark as completed
        await supabaseClient
          .from('operation_queue')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            result: result
          })
          .eq('id', job.id);

        // Log to rate_limit_log
        await supabaseClient
          .from('rate_limit_log')
          .insert({
            user_id: job.user_id,
            org_id: job.org_id,
            operation: job.operation_type
          });

        processed++;
        console.log(`Job ${job.id} completed successfully`);

      } catch (error: any) {
        console.error(`Job ${job.id} failed:`, error);

        // Mark as failed
        await supabaseClient
          .from('operation_queue')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: error.message || 'Unknown error'
          })
          .eq('id', job.id);

        failed++;
      }
    }

    console.log(`Queue processing complete. Processed: ${processed}, Failed: ${failed}`);

    return new Response(
      JSON.stringify({
        success: true,
        total_jobs: jobs?.length || 0,
        processed,
        failed
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Queue processor error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
