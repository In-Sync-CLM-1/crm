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
    const supabaseClient = getSupabaseClient();

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    const { activityId, orgId, title, description, startTime, durationMinutes, participants } = await req.json();

    console.log('Creating Google Meet link for activity:', activityId);

    // Get valid access token
    const { data: tokens, error: tokensError } = await supabaseClient
      .from('google_oauth_tokens')
      .select('*')
      .eq('org_id', orgId)
      .single();

    if (tokensError || !tokens) {
      throw new Error('Google Calendar integration not configured. Please contact your administrator.');
    }

    let accessToken = tokens.access_token;

    // Check if token expired
    if (!tokens.expires_at || new Date(tokens.expires_at) <= new Date()) {
      console.log('Access token expired, refreshing...');
      
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: Deno.env.get('GOOGLE_CLIENT_ID'),
          client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET'),
          refresh_token: tokens.refresh_token,
          grant_type: 'refresh_token'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Token refresh failed:', errorText);
        throw new Error('Failed to refresh Google token');
      }

      const newTokens = await response.json();
      accessToken = newTokens.access_token;
      
      // Update database
      await supabaseClient
        .from('google_oauth_tokens')
        .update({
          access_token: newTokens.access_token,
          expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString()
        })
        .eq('org_id', orgId);
    }

    // Calculate end time
    const startDate = new Date(startTime);
    const endDate = new Date(startDate.getTime() + durationMinutes * 60000);

    // Create Calendar Event
    const event = {
      summary: title,
      description: description,
      start: {
        dateTime: startDate.toISOString(),
        timeZone: 'Asia/Kolkata'
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: 'Asia/Kolkata'
      },
      attendees: participants.map((p: any) => ({ 
        email: p.email, 
        displayName: p.name 
      })),
      conferenceData: {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 30 },
          { method: 'popup', minutes: 30 }
        ]
      }
    };

    console.log('Creating calendar event with Google Calendar API...');

    const calendarResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
      }
    );

    if (!calendarResponse.ok) {
      const errorText = await calendarResponse.text();
      console.error('Calendar API error:', errorText);
      throw new Error('Failed to create calendar event');
    }

    const calendarEvent = await calendarResponse.json();
    const meetLink = calendarEvent.hangoutLink || calendarEvent.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri;

    if (!meetLink) {
      throw new Error('Google Meet link not found in calendar event');
    }

    console.log('Successfully created Google Meet link:', meetLink);

    return new Response(
      JSON.stringify({
        success: true,
        meetLink: meetLink,
        eventId: calendarEvent.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in create-google-meet:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
