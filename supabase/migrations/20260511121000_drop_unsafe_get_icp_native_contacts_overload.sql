-- Drop the 4-arg get_icp_native_contacts overload. It was NOT SECURITY DEFINER,
-- so it would run with the caller's privileges against mkt_native_contacts —
-- a hole that briefly mattered before the table was locked down. No code calls
-- the 4-arg signature (the only caller, temp-icp-or-fix, uses the 6-arg form).

drop function if exists public.get_icp_native_contacts(
  p_industries text[],
  p_designations text[],
  p_company_sizes text[],
  p_limit integer
);
