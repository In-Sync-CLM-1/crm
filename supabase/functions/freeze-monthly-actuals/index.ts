import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MonthlyActuals {
  qualified_opps: number;
  proposals: number;
  deals_closed: number;
  revenue_invoiced: number;
  revenue_received: number;
  qualified_contact_ids: string[];
  proposal_contact_ids: string[];
  deal_contact_ids: string[];
  invoiced_invoice_ids: string[];
  received_invoice_ids: string[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body - can specify org_id and month/year or freeze all orgs for previous month
    let body: { org_id?: string; year?: number; month?: number } = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is fine for scheduled job - will freeze all orgs
    }

    const now = new Date();
    // Default to previous month
    let targetYear = body.year || now.getFullYear();
    let targetMonth = body.month || now.getMonth(); // getMonth is 0-indexed, so current month - 1 for previous

    // If no month specified and we're on 1st of month, freeze previous month
    if (!body.month) {
      if (now.getMonth() === 0) {
        // January - freeze December of previous year
        targetYear = now.getFullYear() - 1;
        targetMonth = 12;
      } else {
        targetMonth = now.getMonth(); // Previous month (1-indexed)
      }
    }

    console.log(`Freezing actuals for ${targetYear}-${targetMonth.toString().padStart(2, '0')}`);

    // Get organizations to process
    let orgsQuery = supabase.from('organizations').select('id');
    if (body.org_id) {
      orgsQuery = orgsQuery.eq('id', body.org_id);
    }

    const { data: orgs, error: orgsError } = await orgsQuery;
    if (orgsError) throw orgsError;

    console.log(`Processing ${orgs?.length || 0} organizations`);

    const results: { org_id: string; success: boolean; error?: string }[] = [];

    for (const org of orgs || []) {
      try {
        const actuals = await calculateMonthlyActuals(
          supabase,
          org.id,
          targetYear,
          targetMonth
        );

        // Check if snapshot already exists
        const { data: existing } = await supabase
          .from('monthly_actuals_snapshot')
          .select('id')
          .eq('org_id', org.id)
          .eq('year', targetYear)
          .eq('month', targetMonth)
          .single();

        if (existing) {
          // Update existing snapshot
          const { error: updateError } = await supabase
            .from('monthly_actuals_snapshot')
            .update({
              ...actuals,
              frozen_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);

          if (updateError) throw updateError;
          console.log(`Updated snapshot for org ${org.id}`);
        } else {
          // Insert new snapshot
          const { error: insertError } = await supabase
            .from('monthly_actuals_snapshot')
            .insert({
              org_id: org.id,
              year: targetYear,
              month: targetMonth,
              ...actuals,
              carry_forward_applied: targetMonth === 1
            });

          if (insertError) throw insertError;
          console.log(`Created snapshot for org ${org.id}`);
        }

        results.push({ org_id: org.id, success: true });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error processing org ${org.id}:`, error);
        results.push({ org_id: org.id, success: false, error: errorMessage });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        year: targetYear,
        month: targetMonth,
        organizations_processed: results.length,
        results 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in freeze-monthly-actuals:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function calculateMonthlyActuals(
  supabase: any,
  orgId: string,
  year: number,
  month: number
): Promise<MonthlyActuals> {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  const monthStartStr = monthStart.toISOString();
  const monthEndStr = monthEnd.toISOString();

  console.log(`Calculating actuals for org ${orgId}, period ${monthStartStr} to ${monthEndStr}`);

  // Get pipeline stages by name for this org
  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, name')
    .eq('org_id', orgId);

  const stageNameToIds: Record<string, string[]> = {};
  for (const stage of stages || []) {
    const normalizedName = stage.name.toLowerCase();
    if (!stageNameToIds[normalizedName]) {
      stageNameToIds[normalizedName] = [];
    }
    stageNameToIds[normalizedName].push(stage.id);
  }

  const qualifiedStageIds = [...(stageNameToIds['demo'] || []), ...(stageNameToIds['qualified'] || [])];
  const proposalStageIds = stageNameToIds['proposal'] || [];
  const wonStageIds = stageNameToIds['won'] || stageNameToIds['closed won'] || [];

  // 1. Calculate Qualified Opps from pipeline_movement_history
  let qualifiedContactIds: string[] = [];
  if (qualifiedStageIds.length > 0) {
    const { data: qualifiedMovements } = await supabase
      .from('pipeline_movement_history')
      .select('contact_id')
      .eq('org_id', orgId)
      .in('to_stage_id', qualifiedStageIds as string[])
      .gte('moved_at', monthStartStr)
      .lt('moved_at', monthEndStr);

    qualifiedContactIds = Array.from(new Set((qualifiedMovements || []).map((m: any) => m.contact_id as string)));
  }

  // For January, add carry-forward contacts
  if (month === 1) {
    const { data: carryForward } = await supabase
      .from('carry_forward_snapshot')
      .select('qualified_contact_ids')
      .eq('org_id', orgId)
      .eq('reference_year', year)
      .single();

    if (carryForward?.qualified_contact_ids) {
      const carryForwardIds = carryForward.qualified_contact_ids.filter(
        (id: string) => !qualifiedContactIds.includes(id)
      );
      qualifiedContactIds = [...qualifiedContactIds, ...carryForwardIds];
      console.log(`Added ${carryForwardIds.length} carry-forward contacts for January`);
    }
  }

  // 2. Calculate Proposals from pipeline_movement_history
  let proposalContactIds: string[] = [];
  if (proposalStageIds.length > 0) {
    const { data: proposalMovements } = await supabase
      .from('pipeline_movement_history')
      .select('contact_id')
      .eq('org_id', orgId)
      .in('to_stage_id', proposalStageIds as string[])
      .gte('moved_at', monthStartStr)
      .lt('moved_at', monthEndStr);

    proposalContactIds = Array.from(new Set((proposalMovements || []).map((m: any) => m.contact_id as string)));
  }

  // 3. Calculate Deals Closed
  // 3a. From pipeline (Won stage)
  let dealContactIds: string[] = [];
  if (wonStageIds.length > 0) {
    const { data: wonMovements } = await supabase
      .from('pipeline_movement_history')
      .select('contact_id')
      .eq('org_id', orgId)
      .in('to_stage_id', wonStageIds as string[])
      .gte('moved_at', monthStartStr)
      .lt('moved_at', monthEndStr);

    dealContactIds = Array.from(new Set((wonMovements || []).map((m: any) => m.contact_id as string)));
  }

  // 3b. Also count invoices raised this month (each invoice = 1 deal for recurring revenue)
  const { data: invoicesRaised } = await supabase
    .from('client_invoices')
    .select('id')
    .eq('org_id', orgId)
    .gte('invoice_date', monthStartStr.split('T')[0])
    .lt('invoice_date', monthEndStr.split('T')[0]);

  const invoiceDealsCount = invoicesRaised?.length || 0;
  const totalDealsCount = dealContactIds.length + invoiceDealsCount;

  // 4. Calculate Revenue Invoiced
  const { data: invoicedData } = await supabase
    .from('client_invoices')
    .select('id, amount')
    .eq('org_id', orgId)
    .gte('invoice_date', monthStartStr.split('T')[0])
    .lt('invoice_date', monthEndStr.split('T')[0]);

  const invoicedInvoiceIds = (invoicedData || []).map((i: any) => i.id);
  const revenueInvoiced = (invoicedData || []).reduce((sum: number, i: any) => sum + (i.amount || 0), 0);

  // 5. Calculate Revenue Received (paid invoices)
  // Note: We need to check for a payment_date or status = 'paid' with updated_at in the month
  const { data: receivedData } = await supabase
    .from('client_invoices')
    .select('id, amount, status, updated_at')
    .eq('org_id', orgId)
    .eq('status', 'paid')
    .gte('updated_at', monthStartStr)
    .lt('updated_at', monthEndStr);

  const receivedInvoiceIds = (receivedData || []).map((i: any) => i.id);
  const revenueReceived = (receivedData || []).reduce((sum: number, i: any) => sum + (i.amount || 0), 0);

  console.log(`Org ${orgId} - Qualified: ${qualifiedContactIds.length}, Proposals: ${proposalContactIds.length}, ` +
    `Deals: ${totalDealsCount}, Invoiced: ${revenueInvoiced}, Received: ${revenueReceived}`);

  return {
    qualified_opps: qualifiedContactIds.length,
    proposals: proposalContactIds.length,
    deals_closed: totalDealsCount,
    revenue_invoiced: revenueInvoiced,
    revenue_received: revenueReceived,
    qualified_contact_ids: qualifiedContactIds,
    proposal_contact_ids: proposalContactIds,
    deal_contact_ids: dealContactIds,
    invoiced_invoice_ids: invoicedInvoiceIds,
    received_invoice_ids: receivedInvoiceIds
  };
}
