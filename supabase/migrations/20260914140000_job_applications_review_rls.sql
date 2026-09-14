-- job_applications shipped service-role-only (no frontend existed yet). Now
-- getting a review queue like BD outreach's -- same single-user, no-org-id
-- shape as mkt_follow_excluded_companies, so the same "authenticated, no
-- scoping needed" policy applies (crm has exactly one real user, Amit).
DROP POLICY IF EXISTS "authenticated read job_applications" ON public.job_applications;
CREATE POLICY "authenticated read job_applications" ON public.job_applications
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated update job_applications" ON public.job_applications;
CREATE POLICY "authenticated update job_applications" ON public.job_applications
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated read job_digest_runs" ON public.job_digest_runs;
CREATE POLICY "authenticated read job_digest_runs" ON public.job_digest_runs
  FOR SELECT TO authenticated USING (true);
