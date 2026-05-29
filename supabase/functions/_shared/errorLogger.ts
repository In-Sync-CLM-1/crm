import { getSupabaseClient } from './supabaseClient.ts';

interface EdgeErrorLog {
  step: string;
  job_id?: string;
  error: any;
  details?: any;
  function_name: string;
}

/**
 * Logs errors from edge functions to console and optionally to database
 */
export async function logEdgeError(log: EdgeErrorLog) {
  const timestamp = new Date().toISOString();
  const errorData = {
    timestamp,
    function: log.function_name,
    step: log.step,
    job_id: log.job_id,
    error: log.error?.message || String(log.error),
    details: log.details,
    stack: log.error?.stack
  };
  
  console.error(`[EDGE-${log.function_name}-${log.step}]`, errorData);
  
  // Save to error_logs table if org_id is available
  if (log.details?.org_id) {
    try {
      const supabase = getSupabaseClient();
      await supabase.from('error_logs').insert({
        org_id: log.details.org_id,
        user_id: log.details.user_id || null,
        error_type: `bulk_import_${log.step}`,
        error_message: log.error?.message || String(log.error),
        error_details: errorData,
        page_url: `edge_function/${log.function_name}`,
        user_agent: 'Deno Edge Function'
      });
    } catch (e) {
      console.error('[LOG-TO-DB-FAILED]', e);
    }
  }
}

/**
 * Logs informational steps during processing
 */
export function logStep(step: string, details?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[STEP-${step}]`, { timestamp, ...details });
}

/**
 * Logs batch processing progress
 */
export function logBatchProgress(batchNum: number, details: {
  batch_size: number;
  inserted: number;
  skipped: number;
  errors: number;
  duration_ms: number;
  records_per_second: number;
}) {
  console.log(`[BATCH-${batchNum}]`, details);
}

/**
 * Logs validation errors with row context
 */
export function logValidationError(row: number, field: string, error: string, sampleData?: string) {
  console.warn(`[VALIDATION-ERROR-ROW-${row}]`, {
    field,
    error,
    sample: sampleData ? sampleData.substring(0, 100) : undefined
  });
}
