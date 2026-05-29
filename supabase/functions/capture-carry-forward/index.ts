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

    const { org_id, reference_year = 2026 } = await req.json();

    if (!org_id) {
      console.error('Missing org_id parameter');
      return new Response(
        JSON.stringify({ error: 'org_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Capturing carry-forward for org ${org_id}, reference year ${reference_year}`);

    // Call the optimized PostgreSQL function
    const { data, error } = await supabase.rpc('capture_carry_forward_optimized', {
      _org_id: org_id,
      _reference_year: reference_year
    });

    if (error) {
      console.error('Error calling capture_carry_forward_optimized:', error);
      throw error;
    }

    // Check if already exists
    if (data?.already_exists) {
      console.log('Carry-forward already captured for this org and year');
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Carry-forward already captured for this organization and year' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contactsCaptured = data?.contacts_captured || 0;
    console.log(`Successfully captured carry-forward for org ${org_id}: ${contactsCaptured} contacts`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Captured ${contactsCaptured} contacts as carry-forward for ${reference_year}`,
        contacts_captured: contactsCaptured,
        contact_ids: data?.contact_ids || []
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in capture-carry-forward:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
