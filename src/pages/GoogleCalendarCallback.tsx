import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useNotification } from "@/hooks/useNotification";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GoogleCalendarCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const notify = useNotification();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Connecting to Google Calendar...');

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');

      if (error) {
        setStatus('error');
        setMessage(`Authorization failed: ${error}`);
        notify.error("Connection Failed", "You cancelled the Google Calendar authorization");
        return;
      }

      if (!code || !state) {
        setStatus('error');
        setMessage('Missing authorization code');
        return;
      }

      try {
        const { data, error: exchangeError } = await supabase.functions.invoke(
          'google-calendar-oauth',
          {
            body: { action: 'exchange-code', code, state },
          }
        );

        if (exchangeError) throw exchangeError;

        setStatus('success');
        setMessage(`Successfully connected Google Calendar: ${data.calendar_email}`);
        
        notify.success("Google Calendar Connected", "You can now generate Google Meet links for your meetings");

        // Redirect after 2 seconds
        setTimeout(() => {
          navigate('/admin');
        }, 2000);
      } catch (error: any) {
        console.error('Callback error:', error);
        setStatus('error');
        setMessage(error.message || 'Failed to connect Google Calendar');
        
        notify.error("Connection Failed", error);
      }
    };

    handleCallback();
  }, [searchParams, navigate, notify]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            {status === 'processing' && (
              <>
                <Loader2 className="h-6 w-6 animate-spin" />
                Processing
              </>
            )}
            {status === 'success' && (
              <>
                <CheckCircle2 className="h-6 w-6 text-green-600" />
                Success
              </>
            )}
            {status === 'error' && (
              <>
                <XCircle className="h-6 w-6 text-destructive" />
                Error
              </>
            )}
          </CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          {status === 'error' && (
            <Button onClick={() => navigate('/admin')}>
              Return to Settings
            </Button>
          )}
          {status === 'success' && (
            <p className="text-sm text-muted-foreground">
              Redirecting to settings...
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
