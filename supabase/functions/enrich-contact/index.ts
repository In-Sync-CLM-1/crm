import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EnrichContactRequest {
  contactId: string;
  revealPhoneNumber?: boolean;
  revealPersonalEmail?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const apolloApiKey = Deno.env.get('APOLLO_API_KEY');

    if (!apolloApiKey) {
      throw new Error('APOLLO_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { contactId, revealPhoneNumber = false, revealPersonalEmail = false }: EnrichContactRequest = await req.json();

    if (!contactId) {
      throw new Error('contactId is required');
    }

    console.log(`[Enrich Contact] Starting enrichment for contact: ${contactId}`);

    // Fetch the contact
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single();

    if (contactError || !contact) {
      throw new Error('Contact not found');
    }

    if (!contact.email) {
      throw new Error('Contact must have an email address for enrichment');
    }

    // Get user's org_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();

    if (!profile || contact.org_id !== profile.org_id) {
      throw new Error('Unauthorized to enrich this contact');
    }

    console.log(`[Enrich Contact] Calling Apollo API for email: ${contact.email}`);

    // Call Apollo API
    const apolloResponse = await fetch('https://api.apollo.io/api/v1/people/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apolloApiKey,
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({
        email: contact.email,
        first_name: contact.first_name || undefined,
        last_name: contact.last_name || undefined,
        organization_name: contact.company || undefined,
        reveal_phone_number: revealPhoneNumber,
        reveal_personal_emails: revealPersonalEmail,
      }),
    });

    if (!apolloResponse.ok) {
      const errorText = await apolloResponse.text();
      console.error(`[Enrich Contact] Apollo API error: ${apolloResponse.status} - ${errorText}`);
      
      // Log the failed enrichment
      await supabase.from('contact_enrichment_logs').insert({
        org_id: contact.org_id,
        contact_id: contactId,
        enrichment_source: 'apollo',
        success: false,
        error_message: `API error: ${apolloResponse.status} - ${errorText}`,
        enriched_by: user.id,
        credits_used: 0,
      });

      throw new Error(`Apollo API error: ${apolloResponse.status}`);
    }

    const apolloData = await apolloResponse.json();
    const person = apolloData.person;

    if (!person) {
      console.log(`[Enrich Contact] No match found for contact: ${contactId}`);
      
      await supabase.from('contact_enrichment_logs').insert({
        org_id: contact.org_id,
        contact_id: contactId,
        enrichment_source: 'apollo',
        success: false,
        error_message: 'No match found',
        enriched_by: user.id,
        credits_used: 1,
      });

      throw new Error('No match found in Apollo database');
    }

    console.log(`[Enrich Contact] Apollo match found, updating contact`);

    // Calculate credits used
    let creditsUsed = 1; // Base credit
    if (revealPhoneNumber && person.phone_numbers?.length > 0) creditsUsed++;
    if (revealPersonalEmail && person.personal_emails?.length > 0) creditsUsed++;

    // Prepare update data
    const updateData: any = {
      linkedin_url: person.linkedin_url || contact.linkedin_url,
      twitter_url: person.twitter_url || contact.twitter_url,
      github_url: person.github_url || contact.github_url,
      facebook_url: person.facebook_url || contact.facebook_url,
      photo_url: person.photo_url || contact.photo_url,
      headline: person.headline || contact.headline,
      seniority: person.seniority || contact.seniority,
      departments: person.departments || contact.departments,
      person_locations: person.city || person.state || person.country ? {
        city: person.city,
        state: person.state,
        country: person.country,
      } : contact.person_locations,
      employment_history: person.employment_history || contact.employment_history,
      education: person.education || contact.education,
      phone_numbers: person.phone_numbers || contact.phone_numbers,
      organization_name: person.organization?.name || contact.organization_name,
      organization_founded_year: person.organization?.founded_year || contact.organization_founded_year,
      organization_industry: person.organization?.industry || contact.organization_industry,
      organization_keywords: person.organization?.keywords || contact.organization_keywords,
      apollo_person_id: person.id,
      last_enriched_at: new Date().toISOString(),
      enrichment_status: 'enriched',
    };

    // Update existing fields only if they're empty
    if (!contact.company && person.organization?.name) {
      updateData.company = person.organization.name;
    }
    if (!contact.job_title && person.title) {
      updateData.job_title = person.title;
    }
    if (!contact.city && person.city) {
      updateData.city = person.city;
    }
    if (!contact.state && person.state) {
      updateData.state = person.state;
    }
    if (!contact.country && person.country) {
      updateData.country = person.country;
    }

    // Track which fields were enriched
    const fieldsEnriched: string[] = [];
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== contact[key] && updateData[key] !== null && updateData[key] !== undefined) {
        fieldsEnriched.push(key);
      }
    });

    // Update the contact
    const { error: updateError } = await supabase
      .from('contacts')
      .update(updateData)
      .eq('id', contactId);

    if (updateError) {
      throw new Error(`Failed to update contact: ${updateError.message}`);
    }

    // Log the successful enrichment
    await supabase.from('contact_enrichment_logs').insert({
      org_id: contact.org_id,
      contact_id: contactId,
      enrichment_source: 'apollo',
      enriched_data: person,
      fields_enriched: fieldsEnriched,
      credits_used: creditsUsed,
      success: true,
      enriched_by: user.id,
    });

    console.log(`[Enrich Contact] Successfully enriched contact: ${contactId}, updated ${fieldsEnriched.length} fields, used ${creditsUsed} credits`);

    return new Response(
      JSON.stringify({
        success: true,
        fieldsEnriched: fieldsEnriched.length,
        creditsUsed,
        contact: updateData,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Enrich Contact] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});