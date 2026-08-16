-- Dead-code audit, 2026-08-17. Everything dropped here was verified to have no
-- caller: no frontend, no edge function, no cron worker, no other database
-- routine, no RLS policy, and no sibling project.
--
-- 1. The outbound-webhook subsystem. All six configured webhooks pointed at
--    https://xopuasvbypkiszcqgdwm.supabase.co/functions/v1/crm-ticket-webhook —
--    a Supabase project that no longer exists. Every delivery since March 2026
--    failed (1,001 consecutive failures, response_status NULL), yet the
--    triggers still fired pg_net calls on every write to blog_posts,
--    email_conversations, support_tickets and six other live tables. The
--    management UI was removed with the rest of the dropped modules, so there
--    was no way to see or fix this from the app.
-- 2. trigger_auto_enrichment, which called an edge function (enrich-contact)
--    that has not existed for months.
-- 3. trigger_retry_failed_whatsapp — the Gupshup retry path, removed in the
--    frontend sweep.
-- 4. 59 routines with no caller anywhere, mostly backends of the modules
--    dropped on 2026-07-15.
-- 5. Tables belonging only to those removed features.

-- 1. Tables of removed features (their own triggers go with them)
DROP TABLE IF EXISTS public.outbound_webhook_logs CASCADE;
DROP TABLE IF EXISTS public.outbound_webhooks CASCADE;
DROP TABLE IF EXISTS public.whatsapp_settings CASCADE;
DROP TABLE IF EXISTS public.operation_queue CASCADE;
DROP TABLE IF EXISTS public.import_staging CASCADE;
DROP TABLE IF EXISTS public.bulk_import_records CASCADE;
DROP TABLE IF EXISTS public.bulk_import_history CASCADE;
DROP TABLE IF EXISTS public.import_jobs CASCADE;
DROP TABLE IF EXISTS public.google_oauth_tokens CASCADE;
DROP TABLE IF EXISTS public.form_fields CASCADE;
DROP TABLE IF EXISTS public.forms CASCADE;
DROP TABLE IF EXISTS public.connector_logs CASCADE;
DROP TABLE IF EXISTS public.saved_reports CASCADE;
DROP TABLE IF EXISTS public.exotel_exophones CASCADE;
DROP TABLE IF EXISTS public.contact_enrichment_logs CASCADE;
DROP TABLE IF EXISTS public.contact_enrichment_runs CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.contacts_with_stages CASCADE;
DROP TABLE IF EXISTS public.api_key_usage_logs CASCADE;
DROP TABLE IF EXISTS public.api_keys CASCADE;
DROP TABLE IF EXISTS public.mkt_ga4_traffic CASCADE;
DROP TABLE IF EXISTS public.monthly_actuals_snapshot CASCADE;
DROP TABLE IF EXISTS public.carry_forward_snapshot CASCADE;

-- 2. Triggers on tables that stay
DROP TRIGGER IF EXISTS webhook_blog_posts_delete ON public.blog_posts;
DROP TRIGGER IF EXISTS webhook_blog_posts_insert ON public.blog_posts;
DROP TRIGGER IF EXISTS webhook_blog_posts_update ON public.blog_posts;
DROP TRIGGER IF EXISTS webhook_call_logs_delete ON public.call_logs;
DROP TRIGGER IF EXISTS webhook_call_logs_insert ON public.call_logs;
DROP TRIGGER IF EXISTS webhook_call_logs_update ON public.call_logs;
DROP TRIGGER IF EXISTS webhook_contact_activities_delete ON public.contact_activities;
DROP TRIGGER IF EXISTS webhook_contact_activities_insert ON public.contact_activities;
DROP TRIGGER IF EXISTS webhook_contact_activities_update ON public.contact_activities;
DROP TRIGGER IF EXISTS trigger_contact_auto_enrich_insert ON public.contacts;
DROP TRIGGER IF EXISTS trigger_contact_auto_enrich_update ON public.contacts;
DROP TRIGGER IF EXISTS webhook_contacts_delete ON public.contacts;
DROP TRIGGER IF EXISTS webhook_contacts_insert ON public.contacts;
DROP TRIGGER IF EXISTS webhook_contacts_update ON public.contacts;
DROP TRIGGER IF EXISTS webhook_email_bulk_campaigns_delete ON public.email_bulk_campaigns;
DROP TRIGGER IF EXISTS webhook_email_bulk_campaigns_insert ON public.email_bulk_campaigns;
DROP TRIGGER IF EXISTS webhook_email_bulk_campaigns_update ON public.email_bulk_campaigns;
DROP TRIGGER IF EXISTS webhook_email_conversations_delete ON public.email_conversations;
DROP TRIGGER IF EXISTS webhook_email_conversations_insert ON public.email_conversations;
DROP TRIGGER IF EXISTS webhook_email_conversations_update ON public.email_conversations;
DROP TRIGGER IF EXISTS webhook_pipeline_stages_delete ON public.pipeline_stages;
DROP TRIGGER IF EXISTS webhook_pipeline_stages_insert ON public.pipeline_stages;
DROP TRIGGER IF EXISTS webhook_pipeline_stages_update ON public.pipeline_stages;
DROP TRIGGER IF EXISTS webhook_profiles_delete ON public.profiles;
DROP TRIGGER IF EXISTS webhook_profiles_insert ON public.profiles;
DROP TRIGGER IF EXISTS webhook_profiles_update ON public.profiles;
DROP TRIGGER IF EXISTS webhook_support_ticket_comments_delete ON public.support_ticket_comments;
DROP TRIGGER IF EXISTS webhook_support_ticket_comments_insert ON public.support_ticket_comments;
DROP TRIGGER IF EXISTS webhook_support_ticket_comments_update ON public.support_ticket_comments;
DROP TRIGGER IF EXISTS webhook_support_ticket_escalations_delete ON public.support_ticket_escalations;
DROP TRIGGER IF EXISTS webhook_support_ticket_escalations_insert ON public.support_ticket_escalations;
DROP TRIGGER IF EXISTS webhook_support_ticket_escalations_update ON public.support_ticket_escalations;
DROP TRIGGER IF EXISTS webhook_support_ticket_history_delete ON public.support_ticket_history;
DROP TRIGGER IF EXISTS webhook_support_ticket_history_insert ON public.support_ticket_history;
DROP TRIGGER IF EXISTS webhook_support_ticket_history_update ON public.support_ticket_history;
DROP TRIGGER IF EXISTS webhook_support_tickets_delete ON public.support_tickets;
DROP TRIGGER IF EXISTS webhook_support_tickets_insert ON public.support_tickets;
DROP TRIGGER IF EXISTS webhook_support_tickets_update ON public.support_tickets;
DROP TRIGGER IF EXISTS webhook_teams_delete ON public.teams;
DROP TRIGGER IF EXISTS webhook_teams_insert ON public.teams;
DROP TRIGGER IF EXISTS webhook_teams_update ON public.teams;
DROP TRIGGER IF EXISTS webhook_whatsapp_bulk_campaigns_delete ON public.whatsapp_bulk_campaigns;
DROP TRIGGER IF EXISTS webhook_whatsapp_bulk_campaigns_insert ON public.whatsapp_bulk_campaigns;
DROP TRIGGER IF EXISTS webhook_whatsapp_bulk_campaigns_update ON public.whatsapp_bulk_campaigns;
DROP TRIGGER IF EXISTS webhook_whatsapp_messages_delete ON public.whatsapp_messages;
DROP TRIGGER IF EXISTS webhook_whatsapp_messages_insert ON public.whatsapp_messages;
DROP TRIGGER IF EXISTS webhook_whatsapp_messages_update ON public.whatsapp_messages;

-- 3. Routines with no remaining caller
DROP FUNCTION IF EXISTS public.advance_enrollment_step(p_enrollment_id uuid, p_current_step integer);
DROP FUNCTION IF EXISTS public.bulk_delete_verified(_table_name text, _record_ids uuid[], _org_id uuid, _user_id uuid);
DROP FUNCTION IF EXISTS public.calculate_monthly_amount(_org_id uuid);
DROP FUNCTION IF EXISTS public.cancel_import(_import_id uuid);
DROP FUNCTION IF EXISTS public.capture_carry_forward_optimized(_org_id uuid, _reference_year integer);
DROP FUNCTION IF EXISTS public.check_connector_rate_limit(_form_id uuid, _limit integer);
DROP FUNCTION IF EXISTS public.check_inactive_contacts();
DROP FUNCTION IF EXISTS public.check_timeout_test();
DROP FUNCTION IF EXISTS public.create_import_session(_table_name text, _file_name text, _total_records integer);
DROP FUNCTION IF EXISTS public.delete_user_data(user_email text);
DROP FUNCTION IF EXISTS public.designation_has_feature_access(_designation_id uuid, _feature_key text, _permission text);
DROP FUNCTION IF EXISTS public.enroll_new_contacts(p_org_id uuid, p_campaign_id uuid, p_product_key text);
DROP FUNCTION IF EXISTS public.ensure_single_default_exophone();
DROP FUNCTION IF EXISTS public.freeze_monthly_actuals(_year integer, _month integer);
DROP FUNCTION IF EXISTS public.generate_api_key();
DROP FUNCTION IF EXISTS public.generate_webhook_token();
DROP FUNCTION IF EXISTS public.get_activity_trends(p_org_id uuid, p_days integer);
DROP FUNCTION IF EXISTS public.get_all_campaigns_analytics(p_org_id uuid);
DROP FUNCTION IF EXISTS public.get_calling_dashboard_stats(_org_id uuid, _days integer, _agent_ids uuid[]);
DROP FUNCTION IF EXISTS public.get_campaign_analytics(p_campaign_id uuid);
DROP FUNCTION IF EXISTS public.get_campaign_step_analytics(p_campaign_id uuid);
DROP FUNCTION IF EXISTS public.get_channel_stats(p_org_id uuid, p_since timestamp with time zone);
DROP FUNCTION IF EXISTS public.get_client_filter_options(_org_id uuid);
DROP FUNCTION IF EXISTS public.get_client_stats(_org_id uuid);
DROP FUNCTION IF EXISTS public.get_dashboard_stats(p_org_id uuid);
DROP FUNCTION IF EXISTS public.get_demo_stats_this_month(p_org_id uuid);
DROP FUNCTION IF EXISTS public.get_icp_native_contacts(p_industries text[], p_designations text[], p_company_sizes text[], p_limit integer, p_offset integer, p_min_id uuid);
DROP FUNCTION IF EXISTS public.get_lead_funnel_stats(p_org_id uuid, p_since timestamp with time zone);
DROP FUNCTION IF EXISTS public.get_marketing_overview(p_org_id uuid, p_since timestamp with time zone);
DROP FUNCTION IF EXISTS public.get_optimal_send_time(_org_id uuid, _contact_id uuid, _default_hour integer);
DROP FUNCTION IF EXISTS public.get_org_statistics(p_org_id uuid);
DROP FUNCTION IF EXISTS public.get_orphaned_profiles();
DROP FUNCTION IF EXISTS public.get_pipeline_distribution(p_org_id uuid);
DROP FUNCTION IF EXISTS public.get_pipeline_performance_report(p_org_id uuid);
DROP FUNCTION IF EXISTS public.get_platform_admin_stats();
DROP FUNCTION IF EXISTS public.get_reporting_chain(p_designation_id uuid);
DROP FUNCTION IF EXISTS public.get_rule_execution_order(_org_id uuid);
DROP FUNCTION IF EXISTS public.get_sales_performance_report(p_org_id uuid, p_start_date timestamp with time zone);
DROP FUNCTION IF EXISTS public.get_subordinates(p_designation_id uuid);
DROP FUNCTION IF EXISTS public.get_unified_inbox(p_org_id uuid, p_limit integer);
DROP FUNCTION IF EXISTS public.increment_campaign_stats(p_campaign_id uuid, p_sent_increment integer, p_failed_increment integer, p_pending_increment integer);
DROP FUNCTION IF EXISTS public.increment_engagement_score(p_action_id uuid, p_event_type text, p_score_delta integer);
DROP FUNCTION IF EXISTS public.is_feature_enabled_for_org(_org_id uuid, _feature_key text);
DROP FUNCTION IF EXISTS public.manage_webhook_trigger(p_table_name text, p_operation text, p_action text);
DROP FUNCTION IF EXISTS public.mark_automation_conversion(_execution_id uuid, _conversion_type text, _conversion_value numeric);
DROP FUNCTION IF EXISTS public.merge_clients_atomic(_primary_client_id uuid, _duplicate_client_ids uuid[], _org_id uuid);
DROP FUNCTION IF EXISTS public.mkt_campaign_channel_stats(p_org_id uuid);
DROP FUNCTION IF EXISTS public.mkt_campaign_daily_stats(p_org_id uuid, p_days integer);
DROP FUNCTION IF EXISTS public.mkt_campaign_stats(p_org_id uuid);
DROP FUNCTION IF EXISTS public.mkt_daily_campaign_stats(p_org_id uuid, p_date date);
DROP FUNCTION IF EXISTS public.mkt_engine_daily_stats(p_org_id uuid, p_days integer);
DROP FUNCTION IF EXISTS public.mkt_hot_leads(p_org_id uuid, p_limit integer);
DROP FUNCTION IF EXISTS public.mkt_product_channel_summary(p_org_id uuid);
DROP FUNCTION IF EXISTS public.mkt_step1_pipeline(p_org_id uuid, p_date date);
DROP FUNCTION IF EXISTS public.process_bulk_import_batch(p_import_id uuid, p_table_name text, p_org_id uuid, p_user_id uuid);
DROP FUNCTION IF EXISTS public.process_time_based_triggers();
DROP FUNCTION IF EXISTS public.refresh_contacts_with_stages();
DROP FUNCTION IF EXISTS public.revert_bulk_import(p_import_id uuid, p_org_id uuid);
DROP FUNCTION IF EXISTS public.set_active_org(p_org_id uuid);
DROP FUNCTION IF EXISTS public.trigger_auto_enrichment();
DROP FUNCTION IF EXISTS public.trigger_outbound_webhook();
DROP FUNCTION IF EXISTS public.trigger_outbound_webhook_generic();
DROP FUNCTION IF EXISTS public.trigger_retry_failed_whatsapp();
DROP FUNCTION IF EXISTS public.update_lead_score(_contact_id uuid, _org_id uuid, _score_delta integer, _reason text);
