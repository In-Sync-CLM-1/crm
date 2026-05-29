import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = getSupabaseClient();

    const { activityId } = await req.json();

    console.log('Sending meeting invitation for activity:', activityId);

    // Fetch activity details with participants
    const { data: activity, error: activityError } = await supabaseClient
      .from('contact_activities')
      .select(`
        *,
        profiles:created_by (first_name, last_name),
        activity_participants (
          id,
          email,
          name,
          profiles:user_id (first_name, last_name)
        )
      `)
      .eq('id', activityId)
      .single();

    if (activityError || !activity) {
      throw new Error('Activity not found');
    }

    if (!activity.meeting_link) {
      throw new Error('No meeting link found');
    }

    // Get pricing
    const { data: pricing, error: pricingError } = await supabaseClient
      .from('subscription_pricing')
      .select('email_cost_per_unit')
      .eq('is_active', true)
      .single();

    if (pricingError) {
      throw new Error('Failed to fetch pricing');
    }

    // Get email settings
    const { data: emailSettings, error: settingsError } = await supabaseClient
      .from('email_settings')
      .select('*')
      .eq('org_id', activity.org_id)
      .eq('is_active', true)
      .single();

    if (settingsError || !emailSettings) {
      throw new Error('Email settings not configured');
    }

    const fromEmail = `noreply@${emailSettings.sending_domain}`;
    const fromName = 'In-Sync Meetings';

    // Format date and time
    const scheduledDate = new Date(activity.scheduled_at || Date.now());
    const formattedDate = scheduledDate.toLocaleString('en-IN', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata'
    });

    // Build participant list
    const participantList = activity.activity_participants
      .map((p: any) => {
        const displayName = p.profiles 
          ? `${p.profiles.first_name} ${p.profiles.last_name || ''}`.trim()
          : p.name;
        return `<li>${displayName} (${p.email})</li>`;
      })
      .join('');

    // Email HTML template
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You're Invited to a Meeting</h2>
        
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">${activity.subject || 'Meeting'}</h3>
          <p><strong>When:</strong> ${formattedDate}</p>
          <p><strong>Duration:</strong> ${activity.meeting_duration_minutes || 30} minutes</p>
          <p><strong>Organized by:</strong> ${activity.profiles ? `${activity.profiles.first_name} ${activity.profiles.last_name || ''}` : 'Team'}</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${activity.meeting_link}" 
             style="background: #4285F4; color: white; padding: 15px 40px; 
                    text-decoration: none; border-radius: 4px; font-size: 16px; 
                    font-weight: bold; display: inline-block;">
            Join with Google Meet
          </a>
        </div>
        
        ${activity.activity_participants.length > 0 ? `
          <div style="margin: 20px 0;">
            <h4>Participants:</h4>
            <ul>
              ${participantList}
            </ul>
          </div>
        ` : ''}
        
        ${activity.description ? `
          <div style="background: #f9f9f9; padding: 15px; border-left: 4px solid #4285F4;">
            <h4>Meeting Details:</h4>
            <p>${activity.description}</p>
          </div>
        ` : ''}
        
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          Meeting link: <a href="${activity.meeting_link}">${activity.meeting_link}</a>
        </p>
      </div>
    `;

    // Send invitations to all participants
    let sentCount = 0;
    const errors: string[] = [];

    for (const participant of activity.activity_participants) {
      try {
        console.log(`Sending invitation to ${participant.email}`);

        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: `${fromName} <${fromEmail}>`,
            to: participant.email,
            subject: `Meeting Invitation: ${activity.subject || 'Meeting'}`,
            html: emailHtml
          })
        });

        if (!resendResponse.ok) {
          const errorText = await resendResponse.text();
          console.error(`Failed to send email to ${participant.email}:`, errorText);
          errors.push(`${participant.email}: ${errorText}`);
          continue;
        }

        // Deduct from wallet
        const walletResult = await supabaseClient.rpc('deduct_from_wallet', {
          _org_id: activity.org_id,
          _amount: pricing.email_cost_per_unit,
          _service_type: 'email',
          _reference_id: activityId,
          _quantity: 1,
          _unit_cost: pricing.email_cost_per_unit,
          _user_id: activity.created_by
        });

        if (!walletResult.data?.success) {
          console.error('Wallet deduction failed:', walletResult.data);
        }

        sentCount++;
      } catch (error: any) {
        console.error(`Error sending to ${participant.email}:`, error);
        errors.push(`${participant.email}: ${error.message}`);
      }
    }

    console.log(`Sent ${sentCount} invitations successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        sentCount,
        totalParticipants: activity.activity_participants.length,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in send-meeting-invitation:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
