import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== sms-webhook Request Started ===');
    console.log('Timestamp:', new Date().toISOString());

    const supabaseClient = getSupabaseClient();

    // Parse form data from Exotel
    const formData = await req.formData();
    const data: Record<string, string> = {};
    
    for (const [key, value] of formData.entries()) {
      data[key] = value.toString();
    }

    console.log('Received SMS webhook data:', JSON.stringify(data, null, 2));

    const smsSid = data.SmsSid;
    const status = data.Status?.toLowerCase();
    const customField = data.CustomField; // Contact ID

    if (!smsSid) {
      console.log('No SmsSid in webhook, skipping');
      return new Response('OK', { headers: corsHeaders });
    }

    // Map Exotel status to our status
    let mappedStatus = status;
    if (status === 'sent' || status === 'submitted') {
      mappedStatus = 'sent';
    } else if (status === 'delivered') {
      mappedStatus = 'delivered';
    } else if (status === 'failed' || status === 'undelivered' || status === 'rejected') {
      mappedStatus = 'failed';
    }

    // Update SMS message status
    const { data: updatedMessage, error: updateError } = await supabaseClient
      .from('sms_messages')
      .update({
        status: mappedStatus,
        delivered_at: mappedStatus === 'delivered' ? new Date().toISOString() : null,
        error_message: data.ErrorCode || null,
        updated_at: new Date().toISOString(),
      })
      .eq('exotel_sms_id', smsSid)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update SMS status:', updateError);
    } else {
      console.log('✓ SMS status updated:', updatedMessage?.id, 'to', mappedStatus);
    }

    // Check if this is an inbound SMS (incoming message)
    if (data.Direction === 'incoming' || data.From) {
      const inboundPhone = data.From;
      const messageBody = data.Body;
      const toNumber = data.To;

      if (inboundPhone && messageBody) {
        // Find the org by the To number (sender ID)
        const { data: exotelSettings } = await supabaseClient
          .from('exotel_settings')
          .select('org_id')
          .eq('sms_sender_id', toNumber)
          .eq('sms_enabled', true)
          .single();

        if (exotelSettings) {
          // Try to find a contact with this phone number
          const { data: contact } = await supabaseClient
            .from('contacts')
            .select('id')
            .eq('org_id', exotelSettings.org_id)
            .eq('phone', inboundPhone)
            .single();

          // Store inbound SMS
          await supabaseClient.from('sms_messages').insert({
            org_id: exotelSettings.org_id,
            contact_id: contact?.id || null,
            phone_number: inboundPhone,
            message_content: messageBody,
            direction: 'inbound',
            status: 'received',
            exotel_sms_id: smsSid,
            sent_at: new Date().toISOString(),
          });

          console.log('✓ Inbound SMS stored for org:', exotelSettings.org_id);
        }
      }
    }

    return new Response('OK', { headers: corsHeaders });
  } catch (error) {
    const err = error as Error;
    console.error('=== sms-webhook Error ===');
    console.error('Error:', err.message);
    
    // Always return 200 to prevent webhook retries
    return new Response('OK', { headers: corsHeaders });
  }
});
