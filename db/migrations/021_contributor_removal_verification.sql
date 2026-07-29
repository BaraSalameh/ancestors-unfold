BEGIN;

CREATE TABLE app.contributor_removal_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id uuid NOT NULL REFERENCES app.family_trees(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  contributor_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  verification_code_hash bytea NOT NULL CHECK (octet_length(verification_code_hash)=32),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (owner_user_id<>contributor_user_id),
  CHECK (expires_at>created_at),
  CHECK (consumed_at IS NULL OR cancelled_at IS NULL)
);

CREATE UNIQUE INDEX contributor_removal_challenges_active_target_uq
  ON app.contributor_removal_challenges(tree_id,owner_user_id,contributor_user_id)
  WHERE consumed_at IS NULL AND cancelled_at IS NULL;

ALTER TABLE app.contributor_removal_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY contributor_removal_owner_access
  ON app.contributor_removal_challenges FOR ALL
  USING (
    owner_user_id=app.current_user_id()
    AND app.has_tree_role(tree_id,'owner')
  )
  WITH CHECK (
    owner_user_id=app.current_user_id()
    AND app.has_tree_role(tree_id,'owner')
  );

CREATE TRIGGER audit_contributor_removal_challenges
AFTER INSERT OR UPDATE OR DELETE ON app.contributor_removal_challenges
FOR EACH ROW EXECUTE FUNCTION audit.capture_change();

GRANT SELECT,INSERT,UPDATE ON app.contributor_removal_challenges TO ancestors_app;

COMMIT;
