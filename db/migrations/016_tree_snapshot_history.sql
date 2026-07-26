BEGIN;

CREATE TABLE app.tree_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id uuid NOT NULL REFERENCES app.family_trees(id),
  version bigint NOT NULL CHECK (version > 0),
  parent_version bigint NOT NULL CHECK (parent_version > 0 AND parent_version < version),
  batch_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES app.users(id),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tree_id,version),
  UNIQUE(tree_id,batch_id)
);
CREATE INDEX tree_snapshots_tree_created_idx
  ON app.tree_snapshots(tree_id,created_at DESC);

ALTER TABLE app.tree_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY tree_snapshot_read ON app.tree_snapshots FOR SELECT USING (
  app.has_tree_role(tree_id,'owner','administrator')
);
CREATE POLICY tree_snapshot_insert ON app.tree_snapshots FOR INSERT WITH CHECK (
  actor_user_id=app.current_user_id() AND (
    app.has_tree_role(tree_id,'owner','administrator','editor') OR EXISTS (
      SELECT 1 FROM app.branch_grants g
      WHERE g.tree_id=tree_snapshots.tree_id AND g.user_id=app.current_user_id()
        AND g.role='branch_editor' AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at>now())
    )
  )
);

-- This projection runs with table-owner privileges so a branch update records a
-- complete canonical tree, while callers can only receive it through an INSERT.
CREATE OR REPLACE FUNCTION app.canonical_tree_snapshot(p_tree_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
  SELECT jsonb_build_object(
    'members',COALESCE((
      SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id)
      FROM app.family_members m
      WHERE m.tree_id=p_tree_id AND m.deleted_at IS NULL
    ),'[]'::jsonb),
    'subfamilies',COALESCE((
      SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id)
      FROM app.subfamilies s
      WHERE s.tree_id=p_tree_id AND s.deleted_at IS NULL
    ),'[]'::jsonb),
    'parent_relationships',COALESCE((
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.child_id,r.parent_role)
      FROM app.parent_child_relationships r
      WHERE r.tree_id=p_tree_id AND r.deleted_at IS NULL
    ),'[]'::jsonb),
    'unions',COALESCE((
      SELECT jsonb_agg(
        to_jsonb(u) || jsonb_build_object('partners',(
          SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.display_order),'[]'::jsonb)
          FROM app.union_partners p WHERE p.union_id=u.id
        )) ORDER BY u.id
      )
      FROM app.unions u
      WHERE u.tree_id=p_tree_id AND u.deleted_at IS NULL
    ),'[]'::jsonb),
    'external_children',COALESCE((
      SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)
      FROM app.external_children e
      WHERE e.tree_id=p_tree_id AND e.deleted_at IS NULL
    ),'[]'::jsonb)
  )
$$;
REVOKE ALL ON FUNCTION app.canonical_tree_snapshot(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.store_tree_snapshot(
  p_tree_id uuid,p_version bigint,p_parent_version bigint,p_batch_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
  IF p_version<>p_parent_version+1 OR NOT EXISTS (
    SELECT 1 FROM app.family_trees t
    WHERE t.id=p_tree_id AND t.version=p_version AND t.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'invalid tree snapshot version';
  END IF;
  IF NOT (
    app.has_tree_role(p_tree_id,'owner','administrator','editor') OR EXISTS (
      SELECT 1 FROM app.branch_grants g
      WHERE g.tree_id=p_tree_id AND g.user_id=app.current_user_id()
        AND g.role='branch_editor' AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at>now())
    )
  ) THEN
    RAISE EXCEPTION 'forbidden tree snapshot';
  END IF;
  INSERT INTO app.tree_snapshots(
    tree_id,version,parent_version,batch_id,actor_user_id,snapshot
  ) VALUES(
    p_tree_id,p_version,p_parent_version,p_batch_id,app.current_user_id(),
    app.canonical_tree_snapshot(p_tree_id)
  );
END $$;
REVOKE ALL ON FUNCTION app.store_tree_snapshot(uuid,bigint,bigint,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.store_tree_snapshot(uuid,bigint,bigint,uuid) TO ancestors_app;

CREATE OR REPLACE FUNCTION app.saved_snapshot_version(
  p_tree_id uuid,p_batch_id uuid
) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
  SELECT version FROM app.tree_snapshots
  WHERE tree_id=p_tree_id AND batch_id=p_batch_id
    AND actor_user_id=app.current_user_id()
$$;
REVOKE ALL ON FUNCTION app.saved_snapshot_version(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.saved_snapshot_version(uuid,uuid) TO ancestors_app;

CREATE OR REPLACE FUNCTION audit.capture_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,audit AS $$
DECLARE oldj jsonb; newj jsonb; entity uuid; tree uuid;
BEGIN
  oldj := CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  newj := CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  entity := COALESCE((newj->>'id')::uuid,(oldj->>'id')::uuid,(newj->>'user_id')::uuid,(oldj->>'user_id')::uuid);
  tree := COALESCE((newj->>'tree_id')::uuid,(oldj->>'tree_id')::uuid);
  INSERT INTO audit.events(actor_user_id,actor_session_id,tree_id,entity_type,entity_id,action,
    request_id,correlation_id,ip_address,user_agent,before_state,after_state)
  VALUES(app.current_user_id(),app.current_session_id(),tree,TG_TABLE_NAME,entity,lower(TG_OP),
    nullif(current_setting('app.request_id',true),'')::uuid,
    nullif(current_setting('app.correlation_id',true),'')::uuid,
    nullif(current_setting('app.ip',true),'')::inet,
    nullif(current_setting('app.user_agent',true),''),audit.redact(oldj),audit.redact(newj));
  RETURN COALESCE(NEW,OLD);
END $$;

GRANT SELECT ON app.tree_snapshots TO ancestors_app;
REVOKE UPDATE,DELETE,TRUNCATE ON app.tree_snapshots FROM ancestors_app;

COMMIT;
