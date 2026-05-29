import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get org_id from request body or user profile
    const { orgId } = await req.json().catch(() => ({}));
    
    let effectiveOrgId = orgId;
    if (!effectiveOrgId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .single();
      effectiveOrgId = profile?.org_id;
    }

    if (!effectiveOrgId) {
      return new Response(
        JSON.stringify({ error: 'No organization found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Exotel settings
    const { data: exotelSettings, error: settingsError } = await supabase
      .from('exotel_settings')
      .select('api_key, api_token, account_sid, subdomain')
      .eq('org_id', effectiveOrgId)
      .single();

    if (settingsError || !exotelSettings) {
      return new Response(
        JSON.stringify({ error: 'Exotel settings not found. Please configure API credentials first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { api_key, api_token, account_sid, subdomain } = exotelSettings;

    if (!api_key || !api_token || !account_sid) {
      return new Response(
        JSON.stringify({ error: 'Incomplete Exotel credentials. Please fill in API Key, API Token, and Account SID.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch ExoPhones from Exotel API v2_beta
    const exotelSubdomain = subdomain || 'api.exotel.com';
    const exotelUrl = `https://${api_key}:${api_token}@${exotelSubdomain}/v2_beta/Accounts/${account_sid}/IncomingPhoneNumbers`;

    console.log('[ExoPhones] Fetching from:', exotelUrl.replace(api_token, '***'));

    const exotelResponse = await fetch(exotelUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!exotelResponse.ok) {
      const errorText = await exotelResponse.text();
      console.error('[ExoPhones] Exotel API error:', exotelResponse.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: `Exotel API error: ${exotelResponse.status}`,
          details: errorText 
        }),
        { status: exotelResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const exotelData = await exotelResponse.json();
    console.log('[ExoPhones] Response:', JSON.stringify(exotelData).slice(0, 500));

    // Extract phone numbers from response
    const exophones = (exotelData.incoming_phone_numbers || []).map((phone: any) => ({
      sid: phone.sid,
      phoneNumber: phone.phone_number,
      friendlyName: phone.friendly_name,
      capabilities: phone.capabilities,
      numberType: phone.number_type,
      region: phone.region,
      country: phone.country,
    }));

    return new Response(
      JSON.stringify({ 
        success: true, 
        exophones,
        total: exophones.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ExoPhones] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
