import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BulkEnrichRequest {
  contactIds: string[];
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

    const { contactIds, revealPhoneNumber = false, revealPersonalEmail = false }: BulkEnrichRequest = await req.json();

    if (!contactIds || contactIds.length === 0) {
      throw new Error('contactIds array is required');
    }

    console.log(`[Bulk Enrich] Starting bulk enrichment for ${contactIds.length} contacts`);

    // Get user's org_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      throw new Error('User profile not found');
    }

    // Fetch all contacts
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('*')
      .in('id', contactIds)
      .eq('org_id', profile.org_id);

    if (contactsError || !contacts) {
      throw new Error('Failed to fetch contacts');
    }

    // Filter contacts with emails
    const contactsWithEmails = contacts.filter(c => c.email);
    
    if (contactsWithEmails.length === 0) {
      throw new Error('No contacts with email addresses found');
    }

    console.log(`[Bulk Enrich] Found ${contactsWithEmails.length} contacts with emails`);

    let totalEnriched = 0;
    let totalFailed = 0;
    let totalCreditsUsed = 0;

    // Process in batches of 10 (Apollo API limit)
    const batchSize = 10;
    for (let i = 0; i < contactsWithEmails.length; i += batchSize) {
      const batch = contactsWithEmails.slice(i, i + batchSize);
      
      console.log(`[Bulk Enrich] Processing batch ${Math.floor(i / batchSize) + 1}, size: ${batch.length}`);

      // Prepare Apollo API request
      const details = batch.map(contact => ({
        email: contact.email,
        first_name: contact.first_name || undefined,
        last_name: contact.last_name || undefined,
        organization_name: contact.company || undefined,
      }));

      try {
        // Call Apollo Bulk Match API
        const apolloResponse = await fetch('https://api.apollo.io/api/v1/people/bulk/match', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': apolloApiKey,
            'Cache-Control': 'no-cache',
          },
          body: JSON.stringify({
            reveal_phone_number: revealPhoneNumber,
            reveal_personal_emails: revealPersonalEmail,
            details,
          }),
        });

        if (!apolloResponse.ok) {
          const errorText = await apolloResponse.text();
          console.error(`[Bulk Enrich] Apollo API error: ${apolloResponse.status} - ${errorText}`);
          
          // Log failures for entire batch
          for (const contact of batch) {
            await supabase.from('contact_enrichment_logs').insert({
              org_id: contact.org_id,
              contact_id: contact.id,
              enrichment_source: 'apollo',
              success: false,
              error_message: `Batch API error: ${apolloResponse.status}`,
              enriched_by: user.id,
              credits_used: 0,
            });
            totalFailed++;
          }
          
          continue; // Skip to next batch
        }

        const apolloData = await apolloResponse.json();
        const matches = apolloData.matches || [];

        console.log(`[Bulk Enrich] Received ${matches.length} matches from Apollo`);

        // Process each match
        for (let j = 0; j < batch.length; j++) {
          const contact = batch[j];
          const person = matches[j];

          if (!person || !person.id) {
            console.log(`[Bulk Enrich] No match for contact: ${contact.id}`);
            
            await supabase.from('contact_enrichment_logs').insert({
              org_id: contact.org_id,
              contact_id: contact.id,
              enrichment_source: 'apollo',
              success: false,
              error_message: 'No match found',
              enriched_by: user.id,
              credits_used: 1,
            });
            
            totalFailed++;
            totalCreditsUsed += 1;
            continue;
          }

          // Calculate credits used for this person
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
            .eq('id', contact.id);

          if (updateError) {
            console.error(`[Bulk Enrich] Failed to update contact ${contact.id}:`, updateError);
            
            await supabase.from('contact_enrichment_logs').insert({
              org_id: contact.org_id,
              contact_id: contact.id,
              enrichment_source: 'apollo',
              success: false,
              error_message: `Update failed: ${updateError.message}`,
              enriched_by: user.id,
              credits_used: creditsUsed,
            });
            
            totalFailed++;
          } else {
            // Log successful enrichment
            await supabase.from('contact_enrichment_logs').insert({
              org_id: contact.org_id,
              contact_id: contact.id,
              enrichment_source: 'apollo',
              enriched_data: person,
              fields_enriched: fieldsEnriched,
              credits_used: creditsUsed,
              success: true,
              enriched_by: user.id,
            });
            
            totalEnriched++;
          }

          totalCreditsUsed += creditsUsed;
        }

        // Small delay between batches to avoid rate limits
        if (i + batchSize < contactsWithEmails.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (batchError) {
        console.error(`[Bulk Enrich] Batch error:`, batchError);
        const batchErrorMessage = batchError instanceof Error ? batchError.message : 'Unknown batch error';
        
        // Log failures for batch
        for (const contact of batch) {
          await supabase.from('contact_enrichment_logs').insert({
            org_id: contact.org_id,
            contact_id: contact.id,
            enrichment_source: 'apollo',
            success: false,
            error_message: `Batch error: ${batchErrorMessage}`,
            enriched_by: user.id,
            credits_used: 0,
          });
          totalFailed++;
        }
      }
    }

    console.log(`[Bulk Enrich] Completed: ${totalEnriched} enriched, ${totalFailed} failed, ${totalCreditsUsed} credits used`);

    return new Response(
      JSON.stringify({
        success: true,
        enriched: totalEnriched,
        failed: totalFailed,
        creditsUsed: totalCreditsUsed,
        total: contactsWithEmails.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Bulk Enrich] Error:', error);
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