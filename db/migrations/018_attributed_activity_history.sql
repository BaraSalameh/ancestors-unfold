BEGIN;

ALTER TABLE app.tree_activity
  ADD COLUMN actor_name_en text,
  ADD COLUMN actor_name_ar text,
  ADD COLUMN subject_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  ADD COLUMN subject_name_en text,
  ADD COLUMN subject_name_ar text,
  ADD COLUMN target_name_en text,
  ADD COLUMN target_name_ar text;

UPDATE app.tree_activity a
SET actor_name_en=u.full_name_en,actor_name_ar=u.full_name_ar
FROM app.users u
WHERE u.id=a.actor_user_id;

ALTER TABLE app.tree_activity
  ADD CONSTRAINT tree_activity_actor_snapshot_ck CHECK (
    actor_user_id IS NULL OR (
      actor_name_en IS NOT NULL AND btrim(actor_name_en)<>''
      AND actor_name_ar IS NOT NULL AND btrim(actor_name_ar)<>''
    )
  ),
  ADD CONSTRAINT tree_activity_subject_snapshot_ck CHECK (
    (subject_name_en IS NULL AND subject_name_ar IS NULL) OR (
      subject_name_en IS NOT NULL AND btrim(subject_name_en)<>''
      AND subject_name_ar IS NOT NULL AND btrim(subject_name_ar)<>''
    )
  );

CREATE OR REPLACE FUNCTION app.capture_activity_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
  IF NEW.actor_user_id IS NOT NULL THEN
    SELECT u.full_name_en,u.full_name_ar
      INTO NEW.actor_name_en,NEW.actor_name_ar
    FROM app.users u WHERE u.id=NEW.actor_user_id;
  END IF;
  IF NEW.subject_user_id IS NOT NULL THEN
    SELECT u.full_name_en,u.full_name_ar
      INTO NEW.subject_name_en,NEW.subject_name_ar
    FROM app.users u WHERE u.id=NEW.subject_user_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.capture_activity_identity() FROM PUBLIC;

CREATE TRIGGER tree_activity_capture_identity
BEFORE INSERT ON app.tree_activity
FOR EACH ROW EXECUTE FUNCTION app.capture_activity_identity();

CREATE OR REPLACE FUNCTION app.store_tree_snapshot(
  p_tree_id uuid,p_version bigint,p_parent_version bigint,p_batch_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE activity_branch_id uuid;
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

  SELECT g.root_subfamily_id INTO activity_branch_id
  FROM app.branch_grants g
  WHERE g.tree_id=p_tree_id AND g.user_id=app.current_user_id()
    AND g.role='branch_editor' AND g.revoked_at IS NULL
    AND (g.expires_at IS NULL OR g.expires_at>now())
  ORDER BY g.granted_at DESC LIMIT 1;

  INSERT INTO app.tree_activity(
    tree_id,branch_id,actor_user_id,action_type,target_type,target_id,
    target_name_en,target_name_ar,metadata
  )
  SELECT t.id,activity_branch_id,app.current_user_id(),'tree_updated',
    'family_tree',t.id,t.name_en,t.name_ar,
    jsonb_build_object(
      'version',p_version,'parentVersion',p_parent_version,'batchId',p_batch_id
    )
  FROM app.family_trees t WHERE t.id=p_tree_id;
END $$;
REVOKE ALL ON FUNCTION app.store_tree_snapshot(uuid,bigint,bigint,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.store_tree_snapshot(uuid,bigint,bigint,uuid) TO ancestors_app;

COMMIT;
