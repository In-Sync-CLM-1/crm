import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { org_id, year } = await req.json();

    if (!org_id || !year) {
      return new Response(
        JSON.stringify({ error: 'org_id and year are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Getting monthly actuals for org ${org_id}, year ${year}`);

    // Call the optimized PostgreSQL function
    const { data, error } = await supabase.rpc('get_monthly_actuals_optimized', {
      _org_id: org_id,
      _year: year
    });

    if (error) {
      console.error('Error calling get_monthly_actuals_optimized:', error);
      throw error;
    }

    // The PostgreSQL function returns a flat array of monthly data
    const monthlyData = data || [];

    console.log('Monthly actuals result:', JSON.stringify(monthlyData).substring(0, 500));

    // Calculate annual totals from the monthly data
    const annualTotals = monthlyData.reduce((acc: any, month: any) => ({
      qualified: acc.qualified + (month.qualified || 0),
      proposals: acc.proposals + (month.proposals || 0),
      deals: acc.deals + (month.deals || 0),
      invoiced: acc.invoiced + (month.invoiced || 0),
      received: acc.received + (month.received || 0),
    }), { qualified: 0, proposals: 0, deals: 0, invoiced: 0, received: 0 });

    return new Response(
      JSON.stringify({ 
        success: true,
        year,
        monthly_actuals: monthlyData,
        annual_totals: annualTotals
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in get-monthly-actuals:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
