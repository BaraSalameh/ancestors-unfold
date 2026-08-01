BEGIN;

ALTER TABLE app.family_members
  ADD COLUMN image_public_id text,
  ADD COLUMN image_asset_id text;

ALTER TABLE app.family_members
  ADD CONSTRAINT family_members_image_asset_pair_ck CHECK (
    (image_public_id IS NULL AND image_asset_id IS NULL) OR
    (image_public_id IS NOT NULL AND image_asset_id IS NOT NULL AND image_url IS NOT NULL)
  );

ALTER TABLE app.family_members
  ADD CONSTRAINT family_members_image_public_id_length_ck
    CHECK (image_public_id IS NULL OR char_length(image_public_id) <= 255),
  ADD CONSTRAINT family_members_image_asset_id_length_ck
    CHECK (image_asset_id IS NULL OR char_length(image_asset_id) <= 255);

CREATE TABLE app.cloudinary_assets (
  asset_id text PRIMARY KEY,
  public_id text NOT NULL UNIQUE,
  tree_id uuid NOT NULL REFERENCES app.family_trees(id) ON DELETE CASCADE,
  member_id uuid,
  secure_url text NOT NULL CHECK (secure_url ~ '^https://res\.cloudinary\.com/'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active')),
  created_by uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  CONSTRAINT cloudinary_assets_member_fk FOREIGN KEY (tree_id,member_id)
    REFERENCES app.family_members(tree_id,id) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX cloudinary_assets_pending_idx
  ON app.cloudinary_assets(created_at) WHERE status='pending';

ALTER TABLE app.cloudinary_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY cloudinary_asset_read ON app.cloudinary_assets FOR SELECT
  USING (app.can_view_tree(tree_id));
CREATE POLICY cloudinary_asset_insert ON app.cloudinary_assets FOR INSERT
  WITH CHECK (
    created_by=app.current_user_id() AND (
      app.has_tree_role(tree_id,'owner','administrator','editor') OR EXISTS (
        SELECT 1 FROM app.branch_grants g WHERE g.tree_id=cloudinary_assets.tree_id
          AND g.user_id=app.current_user_id() AND g.role='branch_editor'
          AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>now())
      )
    )
  );
CREATE POLICY cloudinary_asset_update ON app.cloudinary_assets FOR UPDATE
  USING (created_by=app.current_user_id() OR app.has_tree_role(tree_id,'owner','administrator','editor'));
CREATE POLICY cloudinary_asset_delete ON app.cloudinary_assets FOR DELETE
  USING (created_by=app.current_user_id() OR app.has_tree_role(tree_id,'owner','administrator','editor'));

GRANT SELECT,INSERT,UPDATE,DELETE ON app.cloudinary_assets TO ancestors_app;

CREATE OR REPLACE FUNCTION app.claim_stale_cloudinary_assets()
RETURNS TABLE(public_id text) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
  DELETE FROM app.cloudinary_assets
  WHERE status='pending' AND created_at < now()-interval '24 hours'
  RETURNING public_id
$$;
REVOKE ALL ON FUNCTION app.claim_stale_cloudinary_assets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.claim_stale_cloudinary_assets() TO ancestors_app;

COMMIT;
