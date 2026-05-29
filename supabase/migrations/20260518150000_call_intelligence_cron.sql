-- Daily cron: run transcribe-and-analyze-call to catch up on any call rows
-- (click-to-call + Bolna) that haven't been analyzed yet.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'call-intelligence-daily') THEN
    PERFORM cron.schedule(
      'call-intelligence-daily',
      '15 2 * * *',  -- 02:15 UTC = 07:45 IST every day
      $sql$SELECT net.http_post(
        url     := current_setting('app.settings.supabase_url') || '/functions/v1/transcribe-and-analyze-call',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
          'Content-Type', 'application/json'
        ),
        body    := jsonb_build_object('limit', 50)
      )$sql$
    );
  END IF;
END $$;
