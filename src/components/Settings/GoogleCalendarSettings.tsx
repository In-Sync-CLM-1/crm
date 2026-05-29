import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useNotification } from "@/hooks/useNotification";
import { Calendar, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function GoogleCalendarSettings() {
  const notify = useNotification();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean;
    email?: string;
    calendarId?: string;
  }>({ connected: false });

  useEffect(() => {
    checkConnectionStatus();
  }, []);

  const checkConnectionStatus = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .single();

      if (!profile?.org_id) return;

      const { data: tokens } = await supabase
        .from('google_oauth_tokens')
        .select('calendar_id, user_email')
        .eq('org_id', profile.org_id)
        .maybeSingle();

      if (tokens) {
        setConnectionStatus({
          connected: true,
          email: tokens.user_email,
          calendarId: tokens.calendar_id,
        });
      }
    } catch (error: any) {
      console.error('Error checking connection:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar-oauth', {
        body: { action: 'get-auth-url' },
      });

      if (error) throw error;

      // Open OAuth flow in popup
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      const popup = window.open(
        data.url,
        'Google Calendar Authorization',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      // Poll for popup close and check connection status
      const pollInterval = setInterval(() => {
        if (popup?.closed) {
          clearInterval(pollInterval);
          setConnecting(false);
          checkConnectionStatus();
        }
      }, 1000);
    } catch (error: any) {
      console.error('Connection error:', error);
      notify.error("Connection Failed", error);
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .single();

      if (!profile?.org_id) return;

      const { error } = await supabase
        .from('google_oauth_tokens')
        .delete()
        .eq('org_id', profile.org_id);

      if (error) throw error;

      setConnectionStatus({ connected: false });
      
      notify.success("Disconnected", "Google Calendar has been disconnected");
    } catch (error: any) {
      notify.error("Disconnection Failed", error);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Google Calendar Integration
          </CardTitle>
          <CardDescription>Loading connection status...</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Google Calendar Integration
            </CardTitle>
            <CardDescription>
              Connect Google Calendar to generate Meet links for meetings
            </CardDescription>
          </div>
          {connectionStatus.connected ? (
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Connected
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              <XCircle className="h-3 w-3" />
              Not Connected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {connectionStatus.connected ? (
          <>
            <div className="space-y-2 p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium">Connected Calendar</p>
              <p className="text-sm text-muted-foreground">{connectionStatus.email}</p>
              {connectionStatus.calendarId && (
                <p className="text-xs text-muted-foreground font-mono">
                  Calendar ID: {connectionStatus.calendarId}
                </p>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              You can now generate Google Meet links when creating meetings. All users in your organization can use this calendar integration.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Disconnect Google Calendar</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect Google Calendar?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove the Google Calendar integration. You won't be able to generate Google Meet links until you reconnect.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDisconnect}>
                    Disconnect
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Connect your organization's Google Calendar to enable Google Meet link generation for scheduled meetings.
            </p>
            <div className="space-y-2">
              <p className="text-sm font-medium">Features:</p>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                <li>• Generate Google Meet links automatically</li>
                <li>• Create calendar events with meeting details</li>
                <li>• Send invitations to participants</li>
                <li>• Organization-wide integration</li>
              </ul>
            </div>
            <Button 
              onClick={handleConnect} 
              disabled={connecting}
              className="w-full"
            >
              {connecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Calendar className="mr-2 h-4 w-4" />
                  Connect Google Calendar
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
