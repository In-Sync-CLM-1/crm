-- Code audit 2026-11-15 (approved), CRM: nobody without a sign-in reaches CRM data or actions.
-- CRM has no public pages that read the database: sign-in, password reset and the install page
-- work through Supabase sign-in only, and every server function uses its own system key or the
-- signed-in person's session.

-- 1. A shared check: the caller must belong to the organisation (platform admins may look at any).
--    No signed-in person means the server is calling with the system key (visitors cannot call these any more).
CREATE OR REPLACE FUNCTION public.assert_org_access(p_org uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF public.is_platform_admin(auth.uid()) OR p_org = public.get_user_org_id(auth.uid()) THEN RETURN; END IF;
  RAISE EXCEPTION 'Not allowed for this organisation' USING ERRCODE = '42501';
END;
$function$;

-- 2. Reports that take an organisation: only for members of that organisation (or platform admins).
--    The check is added as the first step of each report; the report itself is unchanged.
DO $$
DECLARE
  f record;
  def text;
  arg text;
BEGIN
  FOR f IN
    SELECT p.oid, p.proname, l.lanname
      FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('get_dashboard_overview','get_monthly_actuals_optimized','get_all_current_icps',
                         'get_campaign_stats','get_current_icp','get_icp_history')
  LOOP
    def := pg_get_functiondef(f.oid);
    IF position('assert_org_access' IN def) > 0 THEN CONTINUE; END IF;
    arg := CASE WHEN f.proname = 'get_campaign_stats' THEN 'p_org_id' ELSE '_org_id' END;
    IF f.lanname = 'sql' THEN
      def := regexp_replace(def, 'AS \$function\$', 'AS $function$ SELECT public.assert_org_access(' || arg || ');');
    ELSIF f.lanname = 'plpgsql' THEN
      def := regexp_replace(def, '\mBEGIN\M', 'BEGIN PERFORM public.assert_org_access(' || arg || ');');
    ELSE
      RAISE EXCEPTION 'Unexpected language % for %', f.lanname, f.proname;
    END IF;
    EXECUTE def;
    IF position('assert_org_access' IN pg_get_functiondef(f.oid)) = 0 THEN
      RAISE EXCEPTION 'Organisation check was not added to %', f.proname;
    END IF;
  END LOOP;
END $$;

-- 3. Table rules that let anyone in (named "service role" but open to everyone). The server's system key
--    does not need them, so they go. Every table keeps its own per-organisation or per-person rules.
DROP POLICY IF EXISTS "Service role can manage all call sessions" ON public.agent_call_sessions;
DROP POLICY IF EXISTS "Service role has full access to blog posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Service role can manage all call logs" ON public.call_logs;
DROP POLICY IF EXISTS "Service role can manage all analytics" ON public.campaign_analytics;
DROP POLICY IF EXISTS "Service role can manage all insights" ON public.campaign_insights;
DROP POLICY IF EXISTS "Service role can manage all email recipients" ON public.email_campaign_recipients;
DROP POLICY IF EXISTS "Service role can manage all email conversations" ON public.email_conversations;
DROP POLICY IF EXISTS "Service role can manage suppression list" ON public.email_suppression_list;
DROP POLICY IF EXISTS "Service role full access on mkt_linkedin_config" ON public.mkt_linkedin_config;
DROP POLICY IF EXISTS "service role writes meta insights" ON public.mkt_meta_insights_daily;
DROP POLICY IF EXISTS "Service role full access on mkt_social_config" ON public.mkt_social_config;
DROP POLICY IF EXISTS "Service role can manage all notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can manage benchmarks" ON public.pipeline_benchmarks;
DROP POLICY IF EXISTS "Service role can manage rate limits" ON public.rate_limit_log;
DROP POLICY IF EXISTS "Service role can insert usage" ON public.service_usage_logs;
DROP POLICY IF EXISTS "Service role can manage all recipients" ON public.whatsapp_campaign_recipients;
-- The feature list is read by signed-in screens only.
DROP POLICY IF EXISTS "Everyone can view feature permissions" ON public.feature_permissions;
CREATE POLICY "Signed-in users can view feature permissions" ON public.feature_permissions
  FOR SELECT TO authenticated USING (true);

-- Screens that relied on those open rules get rules limited to the person's own organisation.
DROP POLICY IF EXISTS "Org members add email campaign recipients" ON public.email_campaign_recipients;
CREATE POLICY "Org members add email campaign recipients" ON public.email_campaign_recipients
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.email_bulk_campaigns c
                       WHERE c.id = email_campaign_recipients.campaign_id
                         AND c.org_id = public.get_user_org_id(auth.uid())));
DROP POLICY IF EXISTS "Org members add WhatsApp campaign recipients" ON public.whatsapp_campaign_recipients;
CREATE POLICY "Org members add WhatsApp campaign recipients" ON public.whatsapp_campaign_recipients
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.whatsapp_bulk_campaigns c
                       WHERE c.id = whatsapp_campaign_recipients.campaign_id
                         AND c.org_id = public.get_user_org_id(auth.uid())));
DROP POLICY IF EXISTS "Org members update WhatsApp campaign recipients" ON public.whatsapp_campaign_recipients;
CREATE POLICY "Org members update WhatsApp campaign recipients" ON public.whatsapp_campaign_recipients
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.whatsapp_bulk_campaigns c
                  WHERE c.id = whatsapp_campaign_recipients.campaign_id
                    AND c.org_id = public.get_user_org_id(auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.whatsapp_bulk_campaigns c
                       WHERE c.id = whatsapp_campaign_recipients.campaign_id
                         AND c.org_id = public.get_user_org_id(auth.uid())));

-- 4. LinkedIn and Facebook connections: the sign-in keys are for the server only.
--    Signed-in staff may read the posting schedule (Content Calendar), never the keys.
REVOKE ALL ON public.mkt_linkedin_config FROM anon, authenticated;
REVOKE ALL ON public.mkt_social_config FROM anon, authenticated;
GRANT SELECT (id, org_id, linkedin_org_id, experiment_slots, start_date, experiment_complete, winning_slot,
              last_posted_date, last_posted_slot_index, last_posted_product_key, active, created_at, updated_at)
  ON public.mkt_linkedin_config TO authenticated;
DROP POLICY IF EXISTS "Org members read LinkedIn posting schedule" ON public.mkt_linkedin_config;
CREATE POLICY "Org members read LinkedIn posting schedule" ON public.mkt_linkedin_config
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) OR public.is_platform_admin(auth.uid()));
-- A connect link is single-use: the server checks the code it issued (see mkt-facebook-oauth-callback).
ALTER TABLE public.mkt_social_config ADD COLUMN IF NOT EXISTS oauth_state text;

-- 5. Visitors without a sign-in get nothing from tables or views (blog posts, call logs, call intelligence,
--    the chart of accounts and the rest). Signed-in access is unchanged and still follows each table's rules.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
-- The two summary views read underlying tables as their owner, so they are for signed-in staff only.
REVOKE ALL ON public.v_call_intelligence FROM anon;
REVOKE ALL ON public.mkt_follow_campaign_stats FROM anon;
ALTER VIEW public.v_call_intelligence SET (security_invoker = true);
ALTER VIEW public.mkt_follow_campaign_stats SET (security_invoker = true);

-- 6. Functions: closed to visitors without a sign-in, except the access-check helpers the table rules use.
--    Server-only functions (accounting journal posting, revenue re-split, campaign counters, daily limits,
--    product switch, organisation set-up) are closed to signed-in people too; the server uses the system key
--    and the accounting triggers run as the database owner.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
           AND p.proname = ANY (ARRAY['get_user_org_id','has_role','is_platform_admin',
                                      'is_admin_of_conversation','is_participant_in_conversation']) LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', f.sig);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
           AND p.proname = ANY (ARRAY['accounting_post_document_journal','accounting_post_payment_journal',
                                      'accounting_resplit_revenue','aggregate_automation_performance_daily',
                                      'check_and_increment_daily_limit','increment_automation_cooldown',
                                      'increment_automation_rule_stats','increment_email_campaign_stats',
                                      'increment_sms_campaign_stats','toggle_product_active',
                                      'create_organization_for_user','cleanup_orphaned_profile',
                                      'create_default_call_dispositions','create_default_pipeline_stages',
                                      'generate_unique_slug','is_email_suppressed','is_email_unsubscribed',
                                      'is_within_business_hours']) LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', f.sig);
  END LOOP;
END $$;

-- 7. Old file folders in database storage: customer files are private (opened by signed-in staff through
--    links that expire). Ticketing is retired; nothing in CRM links to these files any more.
--    email-attachments stays public because the link goes out inside emails; org-logos and
--    whatsapp-templates stay public (logos on emails, media the WhatsApp provider fetches by link).
UPDATE storage.buckets SET public = false
 WHERE id IN ('client-documents', 'ticket-attachments', 'ticket-escalation-attachments');
DROP POLICY IF EXISTS crm_client_documents_select_org ON storage.objects;
CREATE POLICY crm_client_documents_select_org ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'client-documents'
         AND ((storage.foldername(name))[1] = public.get_user_org_id(auth.uid())::text
              OR public.is_platform_admin(auth.uid())));
