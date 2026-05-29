import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IndiamartLead {
  UNIQUE_QUERY_ID: string;
  QUERY_TYPE: string;
  QUERY_TIME: string;
  SENDER_NAME: string;
  SENDER_MOBILE: string;
  SENDER_EMAIL?: string;
  SENDER_COMPANY?: string;
  SENDER_ADDRESS?: string;
  SENDER_CITY?: string;
  SENDER_STATE?: string;
  SENDER_PINCODE?: string;
  SENDER_COUNTRY?: string;
  QUERY_PRODUCT_NAME?: string;
  QUERY_MESSAGE?: string;
  CALL_DURATION?: string;
  RECEIVER_MOBILE?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Received Indiamart webhook request');

    const supabase = getSupabaseClient();

    // Parse the incoming lead data
    const leadData: IndiamartLead = await req.json();
    console.log('Indiamart lead data:', leadData);

    // Extract contact information
    const firstName = leadData.SENDER_NAME?.split(' ')[0] || 'Unknown';
    const lastName = leadData.SENDER_NAME?.split(' ').slice(1).join(' ') || '';
    const phone = leadData.SENDER_MOBILE;
    const email = leadData.SENDER_EMAIL;
    const company = leadData.SENDER_COMPANY;
    const address = leadData.SENDER_ADDRESS;
    const city = leadData.SENDER_CITY;
    const state = leadData.SENDER_STATE;
    const postalCode = leadData.SENDER_PINCODE;
    const country = leadData.SENDER_COUNTRY || 'India';

    // Build notes from query information
    let notes = `Indiamart Lead ID: ${leadData.UNIQUE_QUERY_ID}\n`;
    notes += `Query Type: ${leadData.QUERY_TYPE}\n`;
    notes += `Query Time: ${leadData.QUERY_TIME}\n`;
    if (leadData.QUERY_PRODUCT_NAME) {
      notes += `Product Interest: ${leadData.QUERY_PRODUCT_NAME}\n`;
    }
    if (leadData.QUERY_MESSAGE) {
      notes += `Message: ${leadData.QUERY_MESSAGE}\n`;
    }

    // Get all organizations (we'll need to determine which org to assign to)
    // For now, we'll get the first active org, but you may want to configure this
    const { data: orgs, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .limit(1)
      .single();

    if (orgError || !orgs) {
      console.error('Error fetching organization:', orgError);
      return new Response(
        JSON.stringify({ error: 'No organization found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const orgId = orgs.id;

    // Get the "New" pipeline stage (first stage)
    const { data: stage, error: stageError } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('org_id', orgId)
      .eq('name', 'New')
      .single();

    if (stageError || !stage) {
      console.error('Error fetching pipeline stage:', stageError);
      return new Response(
        JSON.stringify({ error: 'Pipeline stage "New" not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create the contact
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .insert({
        org_id: orgId,
        first_name: firstName,
        last_name: lastName,
        phone: phone,
        email: email,
        company: company,
        address: address,
        city: city,
        state: state,
        postal_code: postalCode,
        country: country,
        source: 'Indiamart',
        status: 'new',
        pipeline_stage_id: stage.id,
        notes: notes,
      })
      .select()
      .single();

    if (contactError) {
      console.error('Error creating contact:', contactError);
      return new Response(
        JSON.stringify({ error: 'Failed to create contact', details: contactError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Successfully created contact:', contact.id);

    // Create an activity log for the lead
    const { error: activityError } = await supabase
      .from('contact_activities')
      .insert({
        contact_id: contact.id,
        org_id: orgId,
        activity_type: 'note',
        subject: 'Indiamart Lead Received',
        description: `New lead received from Indiamart\nProduct: ${leadData.QUERY_PRODUCT_NAME || 'N/A'}\nQuery: ${leadData.QUERY_MESSAGE || 'N/A'}`,
        completed_at: new Date().toISOString(),
      });

    if (activityError) {
      console.error('Error creating activity:', activityError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Lead processed successfully',
        contact_id: contact.id 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing Indiamart webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
