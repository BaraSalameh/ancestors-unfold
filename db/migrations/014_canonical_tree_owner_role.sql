BEGIN;

CREATE OR REPLACE FUNCTION app.has_tree_role(p_tree uuid, VARIADIC p_roles app.tree_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
  SELECT (
    'owner'::app.tree_role=ANY(p_roles)
    AND EXISTS (
      SELECT 1 FROM app.family_trees t
      WHERE t.id=p_tree AND t.owner_user_id=app.current_user_id() AND t.deleted_at IS NULL
    )
  ) OR EXISTS (
    SELECT 1 FROM app.tree_memberships m
    WHERE m.tree_id=p_tree AND m.user_id=app.current_user_id()
      AND m.role=ANY(p_roles) AND m.revoked_at IS NULL
      AND (m.expires_at IS NULL OR m.expires_at > now())
  )
$$;

COMMIT;
