-- ============================================================
-- Close a cross-tenant hole in profiles
-- ============================================================
-- Same shape as the one proven exploitable on globalcrm and fixed in
-- Work-Sync. Access control resolves the caller from two columns of their own
-- profile row:
--
--   get_user_org_id(uid)     -> SELECT org_id            FROM profiles WHERE id = uid
--   is_platform_admin(uid)   -> SELECT is_platform_admin FROM profiles WHERE id = uid
--
-- and "Users can update their own profile" is USING (id = auth.uid()) with no
-- column restriction, so either column can be rewritten by its owner.
--
-- This project currently holds a single organisation, so there is no second
-- tenant to cross into today and nothing is leaking. It is fixed anyway: the
-- write is open, is_platform_admin gates 17 policies here, and the day a
-- second organisation is added the hole becomes live with no further warning.
--
-- A policy cannot restrict which columns an UPDATE touches — WITH CHECK sees
-- only the new row. Column privileges can, but not while the role holds a
-- table-level UPDATE grant (the Supabase default), which permits every column
-- regardless. So the table grant goes first, then the safe columns are
-- granted back.
-- ============================================================

REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon;
REVOKE UPDATE ON public.profiles FROM authenticated;

GRANT UPDATE (
  first_name,
  last_name,
  avatar_url,
  phone,
  is_active,
  onboarding_completed,
  calling_enabled,
  whatsapp_enabled,
  email_enabled,
  sms_enabled,
  updated_at
) ON public.profiles TO authenticated;
