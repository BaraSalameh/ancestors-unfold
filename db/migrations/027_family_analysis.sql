BEGIN;

CREATE TABLE app.analysis_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id uuid NOT NULL REFERENCES app.family_trees(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 120),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX analysis_saved_views_name_uq
  ON app.analysis_saved_views(tree_id,user_id,lower(name));
CREATE INDEX analysis_saved_views_user_tree_idx
  ON app.analysis_saved_views(user_id,tree_id,updated_at DESC);

ALTER TABLE app.analysis_saved_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY analysis_saved_view_select ON app.analysis_saved_views FOR SELECT USING (
  user_id=app.current_user_id() AND app.can_view_tree(tree_id)
);
CREATE POLICY analysis_saved_view_insert ON app.analysis_saved_views FOR INSERT WITH CHECK (
  user_id=app.current_user_id() AND app.can_view_tree(tree_id)
);
CREATE POLICY analysis_saved_view_update ON app.analysis_saved_views FOR UPDATE
  USING (user_id=app.current_user_id() AND app.can_view_tree(tree_id))
  WITH CHECK (user_id=app.current_user_id() AND app.can_view_tree(tree_id));
CREATE POLICY analysis_saved_view_delete ON app.analysis_saved_views FOR DELETE USING (
  user_id=app.current_user_id() AND app.can_view_tree(tree_id)
);

CREATE INDEX family_members_analysis_active_idx
  ON app.family_members(tree_id,birth_date,death_date,gender,citizen_status)
  INCLUDE (subfamily_id,is_unknown,image_url,created_at,updated_at)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION app.branch_members_for_root(p_tree uuid,p_root uuid)
RETURNS TABLE(member_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
  WITH RECURSIVE authorized_root(id) AS (
    SELECT s.id FROM app.subfamilies s
    WHERE s.tree_id=p_tree AND s.id=p_root AND s.deleted_at IS NULL
      AND (
        app.has_tree_role(p_tree,'owner','administrator','editor')
        OR s.id IN (
          SELECT subfamily_id FROM app.branch_subfamilies(p_tree,app.current_user_id())
        )
      )
  ), allowed_sf(id,linked_male_id) AS (
    SELECT s.id,s.linked_male_id FROM app.subfamilies s JOIN authorized_root r ON r.id=s.id
    UNION
    SELECT s.id,s.linked_male_id FROM app.subfamilies s JOIN allowed_sf p ON p.id=s.parent_subfamily_id
    WHERE s.tree_id=p_tree AND s.deleted_at IS NULL
  ), descendants(id) AS (
    SELECT linked_male_id FROM allowed_sf WHERE linked_male_id IS NOT NULL
    UNION
    SELECT r.child_id FROM app.parent_child_relationships r JOIN descendants d ON r.parent_id=d.id
    WHERE r.tree_id=p_tree AND r.deleted_at IS NULL
  ), direct_members(id) AS (
    SELECT m.id FROM app.family_members m JOIN allowed_sf s ON s.id=m.subfamily_id
    WHERE m.tree_id=p_tree AND m.deleted_at IS NULL
  ), core(id) AS (
    SELECT id FROM descendants UNION SELECT id FROM direct_members
  ), spouses(id) AS (
    SELECT other.member_id FROM core c
    JOIN app.union_partners mine ON mine.member_id=c.id AND mine.tree_id=p_tree
    JOIN app.union_partners other ON other.union_id=mine.union_id
    JOIN app.unions u ON u.id=other.union_id AND u.tree_id=p_tree AND u.deleted_at IS NULL
  )
  SELECT id FROM core UNION SELECT id FROM spouses
$$;

REVOKE ALL ON FUNCTION app.branch_members_for_root(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.branch_members_for_root(uuid,uuid) TO ancestors_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON app.analysis_saved_views TO ancestors_app;

COMMIT;
