BEGIN;

CREATE OR REPLACE FUNCTION app.can_analyze_tree(p_tree uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
  SELECT app.can_view_tree(p_tree) AND (
    app.has_tree_role(p_tree,'owner') OR EXISTS (
      SELECT 1
      FROM app.branch_grants g
      JOIN app.tree_memberships m
        ON m.tree_id=g.tree_id AND m.user_id=g.user_id
      WHERE g.tree_id=p_tree AND g.user_id=app.current_user_id()
        AND g.role='branch_editor' AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at>now())
        AND m.affiliation_status='active' AND m.revoked_at IS NULL
        AND (m.expires_at IS NULL OR m.expires_at>now())
    )
  )
$$;

REVOKE ALL ON FUNCTION app.can_analyze_tree(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_analyze_tree(uuid) TO ancestors_app;

CREATE OR REPLACE FUNCTION app.branch_members_for_root(p_tree uuid,p_root uuid)
RETURNS TABLE(member_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
  WITH RECURSIVE authorized_root(id) AS (
    SELECT s.id FROM app.subfamilies s
    WHERE s.tree_id=p_tree AND s.id=p_root AND s.deleted_at IS NULL
      AND app.can_analyze_tree(p_tree)
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
  )
  SELECT id FROM descendants UNION SELECT id FROM direct_members
$$;

REVOKE ALL ON FUNCTION app.branch_members_for_root(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.branch_members_for_root(uuid,uuid) TO ancestors_app;

DO $$
DECLARE
  duplicate_view record;
  suffix text;
  candidate text;
  suffix_number integer;
BEGIN
  FOR duplicate_view IN
    SELECT ranked.id,ranked.tree_id,ranked.name
    FROM (
      SELECT v.id,v.tree_id,v.name,
        row_number() OVER (
          PARTITION BY v.tree_id,lower(v.name)
          ORDER BY v.created_at,v.id
        ) duplicate_position
      FROM app.analysis_saved_views v
    ) ranked
    WHERE ranked.duplicate_position>1
    ORDER BY ranked.tree_id,lower(ranked.name),ranked.id
  LOOP
    suffix_number := 2;
    LOOP
      suffix := format(' (%s)',suffix_number);
      candidate := left(duplicate_view.name,120-char_length(suffix))||suffix;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM app.analysis_saved_views existing
        WHERE existing.tree_id=duplicate_view.tree_id
          AND existing.id<>duplicate_view.id
          AND lower(existing.name)=lower(candidate)
      );
      suffix_number := suffix_number+1;
    END LOOP;
    UPDATE app.analysis_saved_views SET name=candidate WHERE id=duplicate_view.id;
  END LOOP;
END $$;

DROP INDEX app.analysis_saved_views_name_uq;
CREATE UNIQUE INDEX analysis_saved_views_name_uq
  ON app.analysis_saved_views(tree_id,lower(name));

DROP INDEX app.analysis_saved_views_user_tree_idx;
CREATE INDEX analysis_saved_views_tree_updated_idx
  ON app.analysis_saved_views(tree_id,updated_at DESC,id);

CREATE OR REPLACE FUNCTION app.preserve_analysis_saved_view_creator()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'analysis saved view creator cannot be changed';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER preserve_analysis_saved_view_creator
BEFORE UPDATE OF user_id ON app.analysis_saved_views
FOR EACH ROW EXECUTE FUNCTION app.preserve_analysis_saved_view_creator();

DROP POLICY analysis_saved_view_select ON app.analysis_saved_views;
DROP POLICY analysis_saved_view_insert ON app.analysis_saved_views;
DROP POLICY analysis_saved_view_update ON app.analysis_saved_views;
DROP POLICY analysis_saved_view_delete ON app.analysis_saved_views;

CREATE POLICY analysis_saved_view_select ON app.analysis_saved_views FOR SELECT USING (
  app.can_analyze_tree(tree_id)
);
CREATE POLICY analysis_saved_view_insert ON app.analysis_saved_views FOR INSERT WITH CHECK (
  user_id=app.current_user_id() AND app.can_analyze_tree(tree_id)
);
CREATE POLICY analysis_saved_view_update ON app.analysis_saved_views FOR UPDATE
  USING (
    app.can_analyze_tree(tree_id)
    AND (user_id=app.current_user_id() OR app.has_tree_role(tree_id,'owner'))
  )
  WITH CHECK (
    app.can_analyze_tree(tree_id)
    AND (user_id=app.current_user_id() OR app.has_tree_role(tree_id,'owner'))
  );
CREATE POLICY analysis_saved_view_delete ON app.analysis_saved_views FOR DELETE USING (
  app.can_analyze_tree(tree_id)
  AND (user_id=app.current_user_id() OR app.has_tree_role(tree_id,'owner'))
);

COMMIT;
