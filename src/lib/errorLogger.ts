import { supabase } from "@/integrations/supabase/client";

interface ErrorLogData {
  error_type: string;
  error_message: string;
  error_details?: any;
  page_url?: string;
  user_agent?: string;
}

export const logError = async (error: Error, errorInfo?: any) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user?.id || '')
      .maybeSingle();

    if (!profile?.org_id) {
      console.error('Cannot log error: No org_id found');
      return;
    }

    const errorData: ErrorLogData = {
      error_type: error.name || 'Error',
      error_message: error.message,
      error_details: {
        stack: error.stack,
        componentStack: errorInfo?.componentStack,
        ...errorInfo
      },
      page_url: window.location.href,
      user_agent: navigator.userAgent
    };

    await supabase.from('error_logs').insert({
      org_id: profile.org_id,
      user_id: user?.id || null,
      ...errorData
    });

    console.error('Error logged to database:', error);
  } catch (loggingError) {
    console.error('Failed to log error to database:', loggingError);
  }
};

// Set up global error handlers
export const setupErrorLogging = () => {
  // Capture unhandled errors
  window.addEventListener('error', (event) => {
    logError(event.error || new Error(event.message));
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    logError(new Error(`Unhandled Promise Rejection: ${event.reason}`), {
      reason: event.reason
    });
  });
};
