import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

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
    const apolloApiKey = Deno.env.get('APOLLO_API_KEY');

    if (!apolloApiKey) {
      console.log('[Scheduled Enrichment] Apollo API key not configured');
      return new Response(JSON.stringify({ error: 'Apollo API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all organizations with Apollo enrichment enabled
    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('id, apollo_config')
      .not('apollo_config', 'is', null);

    if (orgsError) throw orgsError;

    console.log(`[Scheduled Enrichment] Found ${orgs?.length || 0} orgs with Apollo config`);

    let totalEnriched = 0;
    let totalFailed = 0;

    for (const org of orgs || []) {
      const config = org.apollo_config as any;
      
      // Skip if scheduled enrichment is disabled
      if (!config?.scheduled_enrichment_enabled) {
        console.log(`[Scheduled Enrichment] Skipping org ${org.id} - scheduled enrichment disabled`);
        continue;
      }

      const dailyLimit = config.daily_enrichment_limit || 100;
      const strategy = config.enrichment_strategy || 'new_only';
      const reEnrichDays = config.re_enrich_after_days || 30;

      console.log(`[Scheduled Enrichment] Processing org ${org.id} with strategy: ${strategy}, limit: ${dailyLimit}`);

      // Build query based on strategy
      let query = supabase
        .from('contacts')
        .select('id, email, enrichment_status, last_enriched_at')
        .eq('org_id', org.id)
        .not('email', 'is', null)
        .neq('email', '');

      if (strategy === 'new_only') {
        query = query.or('enrichment_status.is.null,enrichment_status.eq.pending');
      } else if (strategy === 're_enrich_after_days') {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - reEnrichDays);
        query = query.or(
          `enrichment_status.is.null,enrichment_status.eq.pending,last_enriched_at.lt.${cutoffDate.toISOString()}`
        );
      }
      // For 'all' strategy, no additional filters

      query = query.limit(dailyLimit);

      const { data: contacts, error: contactsError } = await query;

      if (contactsError) {
        console.error(`[Scheduled Enrichment] Error fetching contacts for org ${org.id}:`, contactsError);
        continue;
      }

      console.log(`[Scheduled Enrichment] Found ${contacts?.length || 0} contacts to enrich for org ${org.id}`);

      // Process contacts in batches of 25 (Apollo API limit)
      const batchSize = 25;
      for (let i = 0; i < (contacts?.length || 0); i += batchSize) {
        const batch = contacts!.slice(i, i + batchSize);
        const batchEmails = batch.map(c => c.email);

        try {
          // Call Apollo bulk match API
          const apolloResponse = await fetch('https://api.apollo.io/v1/people/bulk_match', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Api-Key': apolloApiKey,
            },
            body: JSON.stringify({
              details: batchEmails.map(email => ({ email })),
              reveal_phone_number: config.default_reveal_phone || false,
              reveal_personal_emails: config.default_reveal_email || false,
            }),
          });

          if (!apolloResponse.ok) {
            console.error(`[Scheduled Enrichment] Apollo API error for org ${org.id}:`, await apolloResponse.text());
            totalFailed += batch.length;
            continue;
          }

          const apolloData = await apolloResponse.json();
          console.log(`[Scheduled Enrichment] Apollo matched ${apolloData.matches?.length || 0} contacts`);

          // Process each match
          for (const match of apolloData.matches || []) {
            const contact = batch.find(c => c.email.toLowerCase() === match.email?.toLowerCase());
            if (!contact) continue;

            const person = match.person;
            if (!person) {
              totalFailed++;
              await supabase.from('contact_enrichment_logs').insert({
                contact_id: contact.id,
                org_id: org.id,
                status: 'failed',
                error_message: 'No person data from Apollo',
              });
              continue;
            }

            // Update contact with enriched data
            const updateData: any = {
              enrichment_status: 'enriched',
              last_enriched_at: new Date().toISOString(),
              apollo_person_id: person.id,
            };

            if (person.first_name) updateData.first_name = person.first_name;
            if (person.last_name) updateData.last_name = person.last_name;
            if (person.title) updateData.job_title = person.title;
            if (person.headline) updateData.headline = person.headline;
            if (person.linkedin_url) updateData.linkedin_url = person.linkedin_url;
            if (person.twitter_url) updateData.twitter_url = person.twitter_url;
            if (person.github_url) updateData.github_url = person.github_url;
            if (person.facebook_url) updateData.facebook_url = person.facebook_url;
            if (person.photo_url) updateData.photo_url = person.photo_url;
            if (person.seniority) updateData.seniority = person.seniority;
            if (person.departments) updateData.departments = person.departments;
            if (person.person_locations) updateData.person_locations = person.person_locations;
            if (person.employment_history) updateData.employment_history = person.employment_history;
            if (person.education) updateData.education = person.education;
            if (person.phone_numbers) updateData.phone_numbers = person.phone_numbers;

            // Organization data
            if (person.organization?.name) updateData.organization_name = person.organization.name;
            if (person.organization?.founded_year) updateData.organization_founded_year = person.organization.founded_year;
            if (person.organization?.industry) updateData.organization_industry = person.organization.industry;
            if (person.organization?.keywords) updateData.organization_keywords = person.organization.keywords;

            const { error: updateError } = await supabase
              .from('contacts')
              .update(updateData)
              .eq('id', contact.id);

            if (updateError) {
              console.error(`[Scheduled Enrichment] Error updating contact ${contact.id}:`, updateError);
              totalFailed++;
              continue;
            }

            // Log success
            await supabase.from('contact_enrichment_logs').insert({
              contact_id: contact.id,
              org_id: org.id,
              status: 'success',
              fields_enriched: Object.keys(updateData).length,
              credits_used: 1,
            });

            totalEnriched++;
          }
        } catch (error: any) {
          console.error(`[Scheduled Enrichment] Error processing batch for org ${org.id}:`, error);
          totalFailed += batch.length;
        }

        // Add delay between batches to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`[Scheduled Enrichment] Completed - Enriched: ${totalEnriched}, Failed: ${totalFailed}`);

    return new Response(
      JSON.stringify({
        success: true,
        enriched: totalEnriched,
        failed: totalFailed,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[Scheduled Enrichment] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
