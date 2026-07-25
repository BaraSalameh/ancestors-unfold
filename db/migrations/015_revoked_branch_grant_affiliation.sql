CREATE OR REPLACE FUNCTION app.validate_branch_grantee() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- A revoked grant is historical data, not an active contributor affiliation.
  IF NEW.revoked_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM app.tree_memberships m
    WHERE m.user_id=NEW.user_id AND m.tree_id=NEW.tree_id
      AND m.affiliation_status='active' AND m.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'branch contributor must be actively affiliated with the same tree';
  END IF;
  RETURN NEW;
END $$;
