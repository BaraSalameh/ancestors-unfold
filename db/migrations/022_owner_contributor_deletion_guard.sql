BEGIN;

CREATE FUNCTION app.owner_can_delete_contributor(p_tree_id uuid,p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
  SELECT
    app.has_tree_role(p_tree_id,'owner')
    AND EXISTS (
      SELECT 1 FROM app.tree_memberships m
      WHERE m.tree_id=p_tree_id AND m.user_id=p_user_id
        AND m.role<>'owner' AND m.affiliation_status='active' AND m.revoked_at IS NULL
    )
    AND (
      SELECT count(*) FROM app.tree_memberships m
      WHERE m.user_id=p_user_id AND m.revoked_at IS NULL
    )=1
$$;
REVOKE ALL ON FUNCTION app.owner_can_delete_contributor(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.owner_can_delete_contributor(uuid,uuid) TO ancestors_app;

COMMIT;
