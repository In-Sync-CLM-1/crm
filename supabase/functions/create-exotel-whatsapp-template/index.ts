import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TemplateButton {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
}

interface TemplateRequest {
  template_name: string;
  category: string;
  language: string;
  header_type: string | null;
  header_content: string | null;
  body_content: string;
  footer_text: string | null;
  buttons: TemplateButton[] | null;
  sample_values: {
    header?: string[];
    body?: string[];
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== create-exotel-whatsapp-template Started ===');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No Authorization header provided');
    }

    const token = authHeader.replace('Bearer ', '');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      throw new Error('Authentication failed');
    }

    // Get user's org_id
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();

    if (!profile?.org_id) {
      throw new Error('Organization not found');
    }

    const orgId = profile.org_id;

    // Parse request body
    const body: TemplateRequest = await req.json();
    console.log('Template request:', JSON.stringify(body, null, 2));

    const {
      template_name,
      category,
      language,
      header_type,
      header_content,
      body_content,
      footer_text,
      buttons,
      sample_values,
    } = body;

    if (!template_name || !body_content) {
      throw new Error('Template name and body content are required');
    }

    // Get Exotel settings
    const { data: exotelSettings } = await supabaseClient
      .from('exotel_settings')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .eq('whatsapp_enabled', true)
      .single();

    if (!exotelSettings) {
      return new Response(
        JSON.stringify({ error: 'Exotel WhatsApp not configured. Please configure it in Exotel Settings.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!exotelSettings.waba_id) {
      return new Response(
        JSON.stringify({ error: 'WABA ID not configured in Exotel Settings.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build template components
    const components: any[] = [];

    // Header component
    if (header_type && header_type !== 'none') {
      const headerComponent: any = {
        type: 'HEADER',
      };

      if (header_type === 'text') {
        headerComponent.format = 'TEXT';
        headerComponent.text = header_content || '';
        
        // Add example for header variables
        if (sample_values?.header && sample_values.header.length > 0) {
          headerComponent.example = {
            header_text: sample_values.header
          };
        }
      } else if (header_type === 'image') {
        headerComponent.format = 'IMAGE';
        if (header_content) {
          headerComponent.example = { header_handle: [header_content] };
        }
      } else if (header_type === 'video') {
        headerComponent.format = 'VIDEO';
        if (header_content) {
          headerComponent.example = { header_handle: [header_content] };
        }
      } else if (header_type === 'document') {
        headerComponent.format = 'DOCUMENT';
        if (header_content) {
          headerComponent.example = { header_handle: [header_content] };
        }
      }

      components.push(headerComponent);
    }

    // Body component
    const bodyComponent: any = {
      type: 'BODY',
      text: body_content,
    };

    // Add example for body variables
    if (sample_values?.body && sample_values.body.length > 0) {
      bodyComponent.example = {
        body_text: [sample_values.body]
      };
    }

    components.push(bodyComponent);

    // Footer component
    if (footer_text) {
      components.push({
        type: 'FOOTER',
        text: footer_text,
      });
    }

    // Buttons component
    if (buttons && buttons.length > 0) {
      const exotelButtons = buttons.map((btn) => {
        if (btn.type === 'URL') {
          return {
            type: 'URL',
            text: btn.text,
            url: btn.url || '',
          };
        } else if (btn.type === 'PHONE_NUMBER') {
          return {
            type: 'PHONE_NUMBER',
            text: btn.text,
            phone_number: btn.phone_number || '',
          };
        } else {
          // QUICK_REPLY
          return {
            type: 'QUICK_REPLY',
            text: btn.text,
          };
        }
      });

      components.push({
        type: 'BUTTONS',
        buttons: exotelButtons,
      });
    }

    // Build the Exotel API payload
    const exotelPayload = {
      whatsapp: {
        templates: [
          {
            template: {
              name: template_name,
              language: language || 'en',
              category: category.toUpperCase(),
              components: components,
            },
          },
        ],
      },
    };

    console.log('Exotel payload:', JSON.stringify(exotelPayload, null, 2));

    // Call Exotel API to create template
    const exotelUrl = `https://${exotelSettings.api_key}:${exotelSettings.api_token}@${exotelSettings.subdomain}/v2/accounts/${exotelSettings.account_sid}/templates?waba_id=${exotelSettings.waba_id}`;

    console.log('Calling Exotel API...');

    const exotelResponse = await fetch(exotelUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(exotelPayload),
    });

    const responseText = await exotelResponse.text();
    console.log('Exotel API response status:', exotelResponse.status);
    console.log('Exotel API response:', responseText);

    let exotelResult;
    try {
      exotelResult = JSON.parse(responseText);
    } catch {
      exotelResult = { raw: responseText };
    }

    if (!exotelResponse.ok) {
      const errorMessage = exotelResult?.response?.whatsapp?.templates?.[0]?.data?.error?.error_user_msg 
        || exotelResult?.error 
        || exotelResult?.message 
        || `Exotel API error: ${exotelResponse.status}`;
      
      return new Response(
        JSON.stringify({ error: errorMessage, details: exotelResult }),
        { status: exotelResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if the template was created successfully
    const templateResponse = exotelResult?.response?.whatsapp?.templates?.[0];
    if (templateResponse?.code !== 200) {
      const errorMessage = templateResponse?.data?.error?.error_user_msg 
        || templateResponse?.data?.error?.message 
        || 'Template creation failed';
      
      return new Response(
        JSON.stringify({ error: errorMessage, details: exotelResult }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store template in database
    const serviceClient = getSupabaseClient();
    const templateData = templateResponse?.data;
    
    const { error: insertError } = await serviceClient
      .from('communication_templates')
      .insert({
        org_id: orgId,
        template_id: templateData?.id || template_name,
        template_name: template_name,
        template_type: 'whatsapp',
        content: body_content,
        category: category.toLowerCase(),
        language: language || 'en',
        status: 'pending',
        submission_status: 'pending',
        header_type: header_type && header_type !== 'none' ? header_type : null,
        header_content: header_type === 'text' ? header_content : null,
        footer_text: footer_text,
        buttons: buttons,
        sample_values: sample_values,
        submitted_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('Error saving template to database:', insertError);
      // Don't fail the request since template was created in Exotel
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Template submitted successfully for WhatsApp approval',
        template_id: templateData?.id,
        status: templateData?.status || 'PENDING',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error creating template:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
