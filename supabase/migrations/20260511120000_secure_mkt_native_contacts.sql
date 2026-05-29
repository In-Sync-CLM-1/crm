-- Lock down public.mkt_native_contacts: 194k+ contact PII rows were exposed
-- to the anon role. All legitimate access goes through service_role
-- (Edge Functions, Python imports) or the SECURITY DEFINER RPC
-- get_icp_native_contacts, neither of which need anon/authenticated grants.

alter table public.mkt_native_contacts enable row level security;

revoke all on public.mkt_native_contacts from anon;
revoke all on public.mkt_native_contacts from authenticated;
