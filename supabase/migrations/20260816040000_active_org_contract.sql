-- ============================================================
-- The fleet active-organisation contract
-- ============================================================
-- Every app in the fleet answers "which organisation am I working in" through
-- the same call: set_active_org(uuid), refusing any organisation the caller is
-- not a member of. This project already has the other half — profiles.org_id
-- is locked, so nobody can move themselves by hand — but there was no
-- sanctioned way to move at all.
--
-- Only one organisation exists here today, so nothing changes in practice.
-- It is added so the contract is complete before a second one appears: the
-- moment it does, switching must already go through a membership check rather
-- than being invented in a hurry.
-- ============================================================

CREATE OR REPLACE FUNCTION set_active_org(p_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  -- Membership is the whole check. A platform admin is not exempt: to work
  -- inside an organisation they join it like anyone else, so "what can this
  -- session touch" stays answerable from one table.
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
     WHERE user_id = v_uid
       AND org_id = p_org_id
       AND COALESCE(is_active, true)
  ) THEN
    RAISE EXCEPTION 'You are not a member of that organisation';
  END IF;

  UPDATE profiles SET org_id = p_org_id WHERE id = v_uid;
  RETURN p_org_id;
END;
$$;

REVOKE ALL ON FUNCTION set_active_org(uuid) FROM public;
GRANT EXECUTE ON FUNCTION set_active_org(uuid) TO authenticated;
