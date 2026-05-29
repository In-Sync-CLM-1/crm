import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DomainRequest {
  action: 'create-domain' | 'verify-domain' | 'get-domain' | 'delete-domain';
  domain?: string;
  domainId?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== manage-resend-domain Request Started ===');
    console.log('Request method:', req.method);
    console.log('Timestamp:', new Date().toISOString());

    // Check for Authorization header
    const authHeader = req.headers.get('Authorization');
    console.log('Auth Header Status:', {
      present: !!authHeader,
      preview: authHeader ? `${authHeader.substring(0, 20)}...` : 'MISSING',
      length: authHeader?.length || 0
    });

    if (!authHeader) {
      throw new Error('No Authorization header provided');
    }

    // Extract JWT token (remove "Bearer " prefix)
    const token = authHeader.replace('Bearer ', '');
    console.log('Extracted JWT token (length):', token.length);

    // Create client with anon key
    console.log('Creating Supabase client with ANON_KEY...');
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
        auth: {
          persistSession: false,
        },
      }
    );
    console.log('✓ Supabase client created successfully');

    // Authenticate user by passing token directly to getUser()
    console.log('Attempting user authentication with JWT token...');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    console.log('User Auth Result:', {
      success: !!user,
      userId: user?.id || 'N/A',
      userEmail: user?.email || 'N/A',
      hasError: !!userError,
      errorCode: userError?.code || 'N/A',
      errorMessage: userError?.message || 'N/A',
      errorStatus: userError?.status || 'N/A',
    });

    if (userError) {
      console.error('Auth Error Details:', JSON.stringify(userError, null, 2));
      throw new Error(`Authentication failed: ${userError.message}`);
    }

    if (!user) {
      throw new Error('No user found in session');
    }

    console.log('✓ User authenticated:', user.email);

    // Fetch user profile and org_id
    console.log('Fetching user profile and org_id...');
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();

    console.log('Profile Lookup Result:', {
      found: !!profile,
      orgId: profile?.org_id || 'N/A',
      hasError: !!profileError,
      errorMessage: profileError?.message || 'N/A'
    });

    if (profileError) {
      console.error('Profile Error:', profileError);
      throw new Error(`Failed to fetch user profile: ${profileError.message}`);
    }

    if (!profile?.org_id) {
      throw new Error('User organization not found');
    }

    console.log('✓ Organization verified:', profile.org_id);

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      throw new Error('Resend API key not configured');
    }

    const { action, domain, domainId }: DomainRequest = await req.json();
    console.log('Processing action:', action, 'for org:', profile.org_id);

    let result;

    switch (action) {
      case 'create-domain': {
        if (!domain) {
          throw new Error('Domain is required');
        }

        console.log('Creating domain in Resend:', domain);
        const createResponse = await fetch('https://api.resend.com/domains', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            name: domain,
            region: 'us-east-1'
          }),
        });

        if (!createResponse.ok) {
          const error = await createResponse.text();
          console.error('Resend API error:', error);
          throw new Error(`Failed to create domain: ${error}`);
        }

        const resendData = await createResponse.json();
        console.log('Domain created in Resend:', resendData);

        // Store in database
        const { data: existingSettings } = await supabaseClient
          .from('email_settings')
          .select('id')
          .eq('org_id', profile.org_id)
          .maybeSingle();

        if (existingSettings) {
          const { error: updateError } = await supabaseClient
            .from('email_settings')
            .update({
              sending_domain: domain,
              resend_domain_id: resendData.id,
              verification_status: 'pending',
              dns_records: resendData.records || {},
              verified_at: null,
            })
            .eq('org_id', profile.org_id);

          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabaseClient
            .from('email_settings')
            .insert({
              org_id: profile.org_id,
              sending_domain: domain,
              resend_domain_id: resendData.id,
              verification_status: 'pending',
              dns_records: resendData.records || {},
            });

          if (insertError) throw insertError;
        }

        result = resendData;
        break;
      }

      case 'verify-domain': {
        const { data: settings } = await supabaseClient
          .from('email_settings')
          .select('resend_domain_id')
          .eq('org_id', profile.org_id)
          .single();

        if (!settings?.resend_domain_id) {
          throw new Error('No domain configured');
        }

        console.log('Verifying domain:', settings.resend_domain_id);
        const verifyResponse = await fetch(
          `https://api.resend.com/domains/${settings.resend_domain_id}/verify`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!verifyResponse.ok) {
          const error = await verifyResponse.text();
          console.error('Resend verify error:', error);
          throw new Error(`Failed to verify domain: ${error}`);
        }

        const verifyData = await verifyResponse.json();
        console.log('Verification result:', verifyData);

        // Update status in database
        const newStatus = verifyData.status === 'verified' ? 'verified' : 'pending';
        const { error: updateError } = await supabaseClient
          .from('email_settings')
          .update({
            verification_status: newStatus,
            verified_at: newStatus === 'verified' ? new Date().toISOString() : null,
          })
          .eq('org_id', profile.org_id);

        if (updateError) throw updateError;

        // Note: Inbound routing is currently in private alpha and must be configured manually via Resend Dashboard

        result = verifyData;
        break;
      }

      case 'get-domain': {
        const { data: settings } = await supabaseClient
          .from('email_settings')
          .select('*')
          .eq('org_id', profile.org_id)
          .single();

        if (!settings?.resend_domain_id) {
          return new Response(
            JSON.stringify({ settings: null }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('Fetching domain details:', settings.resend_domain_id);
        const getResponse = await fetch(
          `https://api.resend.com/domains/${settings.resend_domain_id}`,
          {
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
            },
          }
        );

        if (!getResponse.ok) {
          const error = await getResponse.text();
          console.error('Resend get domain error:', error);
          throw new Error(`Failed to fetch domain: ${error}`);
        }

        const domainData = await getResponse.json();
        
        // Update DNS records in database if they've changed
        if (domainData.records) {
          await supabaseClient
            .from('email_settings')
            .update({
              dns_records: domainData.records,
              verification_status: domainData.status || settings.verification_status,
            })
            .eq('org_id', profile.org_id);
        }

        result = { ...settings, resendData: domainData };
        break;
      }

      case 'delete-domain': {
        const { data: settings } = await supabaseClient
          .from('email_settings')
          .select('resend_domain_id')
          .eq('org_id', profile.org_id)
          .single();

        if (!settings?.resend_domain_id) {
          throw new Error('No domain configured');
        }

        console.log('Deleting domain:', settings.resend_domain_id);
        const deleteResponse = await fetch(
          `https://api.resend.com/domains/${settings.resend_domain_id}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
            },
          }
        );

        if (!deleteResponse.ok) {
          const error = await deleteResponse.text();
          console.error('Resend delete error:', error);
          throw new Error(`Failed to delete domain: ${error}`);
        }

        // Delete from database
        const { error: deleteError } = await supabaseClient
          .from('email_settings')
          .delete()
          .eq('org_id', profile.org_id);

        if (deleteError) throw deleteError;

        result = { success: true };
        break;
      }

      default:
        throw new Error('Invalid action');
    }

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const err = error as Error;
    console.error('=== manage-resend-domain Error ===');
    console.error('Error Type:', err.constructor.name);
    console.error('Error Message:', err.message);
    console.error('Error Stack:', err.stack);
    console.error('Timestamp:', new Date().toISOString());
    
    return new Response(
      JSON.stringify({ 
        error: err.message,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: err.message.includes('Unauthorized') || err.message.includes('Authentication') ? 401 : 400,
      }
    );
  }
});
