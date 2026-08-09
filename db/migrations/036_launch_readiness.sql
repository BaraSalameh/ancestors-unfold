BEGIN;

-- Keep snapshots self-describing across future schema changes and retain a
-- navigable predecessor when that predecessor is available.
ALTER TABLE app.tree_snapshots
  ADD COLUMN schema_version smallint NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  ADD COLUMN parent_snapshot_id uuid;

UPDATE app.tree_snapshots snapshot
SET parent_snapshot_id=parent.id
FROM app.tree_snapshots parent
WHERE parent.tree_id=snapshot.tree_id
  AND parent.version=snapshot.parent_version;

ALTER TABLE app.tree_snapshots
  ADD CONSTRAINT tree_snapshots_tree_id_id_uq UNIQUE (tree_id,id),
  ADD CONSTRAINT tree_snapshots_parent_fk
    FOREIGN KEY (tree_id,parent_snapshot_id)
    REFERENCES app.tree_snapshots(tree_id,id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE app.tree_snapshots ALTER COLUMN snapshot SET COMPRESSION lz4;

ALTER TABLE app.analysis_saved_views
  ADD COLUMN definition_version smallint NOT NULL DEFAULT 1
    CHECK (definition_version > 0);

-- Explicit projections keep the persisted snapshot contract stable when a
-- table later gains an internal-only column.
CREATE OR REPLACE FUNCTION app.canonical_tree_snapshot(p_tree_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
  SELECT jsonb_build_object(
    'members',COALESCE((
      SELECT jsonb_agg(to_jsonb(projected) ORDER BY projected.id)
      FROM (
        SELECT m.id,m.tree_id,m.name_en,m.name_ar,m.gender,m.birth_date,m.death_date,
          m.citizen_status,m.notes,m.is_unknown,m.pos_x,m.pos_y,m.created_by,m.updated_by,
          m.version,m.created_at,m.updated_at,m.deleted_at,m.subfamily_id,m.linked_user_id,
          m.position_label,m.image_url,m.image_public_id,m.image_asset_id,m.is_deceased
        FROM app.family_members m
        WHERE m.tree_id=p_tree_id AND m.deleted_at IS NULL
      ) projected
    ),'[]'::jsonb),
    'subfamilies',COALESCE((
      SELECT jsonb_agg(to_jsonb(projected) ORDER BY projected.id)
      FROM (
        SELECT s.id,s.tree_id,s.parent_subfamily_id,s.linked_male_id,s.name_en,s.name_ar,
          s.notes,s.version,s.created_at,s.updated_at,s.deleted_at,s.status
        FROM app.subfamilies s
        WHERE s.tree_id=p_tree_id AND s.deleted_at IS NULL
      ) projected
    ),'[]'::jsonb),
    'parent_relationships',COALESCE((
      SELECT jsonb_agg(to_jsonb(projected) ORDER BY projected.child_id,projected.parent_role)
      FROM (
        SELECT r.id,r.tree_id,r.child_id,r.parent_id,r.parent_role,r.created_by,
          r.created_at,r.deleted_at
        FROM app.parent_child_relationships r
        WHERE r.tree_id=p_tree_id AND r.deleted_at IS NULL
      ) projected
    ),'[]'::jsonb),
    'unions',COALESCE((
      SELECT jsonb_agg(
        to_jsonb(projected) || jsonb_build_object('partners',(
          SELECT COALESCE(jsonb_agg(to_jsonb(partner) ORDER BY partner.display_order),'[]'::jsonb)
          FROM (
            SELECT p.union_id,p.tree_id,p.member_id,p.display_order,p.created_at
            FROM app.union_partners p WHERE p.union_id=projected.id
          ) partner
        )) ORDER BY projected.id
      )
      FROM (
        SELECT u.id,u.tree_id,u.status,u.display_order,u.created_by,u.updated_by,
          u.version,u.created_at,u.updated_at,u.deleted_at
        FROM app.unions u
        WHERE u.tree_id=p_tree_id AND u.deleted_at IS NULL
      ) projected
    ),'[]'::jsonb),
    'external_children',COALESCE((
      SELECT jsonb_agg(to_jsonb(projected) ORDER BY projected.id)
      FROM (
        SELECT e.id,e.tree_id,e.mother_id,e.name,e.other_parent_name,e.birth_year,
          e.notes,e.created_at,e.updated_at,e.deleted_at
        FROM app.external_children e
        WHERE e.tree_id=p_tree_id AND e.deleted_at IS NULL
      ) projected
    ),'[]'::jsonb)
  )
$$;

CREATE OR REPLACE FUNCTION app.store_tree_snapshot(
  p_tree_id uuid,p_version bigint,p_parent_version bigint,p_batch_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE v_parent_snapshot_id uuid;
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

  SELECT id INTO v_parent_snapshot_id
  FROM app.tree_snapshots
  WHERE tree_id=p_tree_id AND version=p_parent_version;

  INSERT INTO app.tree_snapshots(
    tree_id,version,parent_version,parent_snapshot_id,batch_id,actor_user_id,
    schema_version,snapshot
  ) VALUES(
    p_tree_id,p_version,p_parent_version,v_parent_snapshot_id,p_batch_id,
    app.current_user_id(),1,app.canonical_tree_snapshot(p_tree_id)
  );
END $$;

-- Build the ancestry closure once per save and reuse it for both branch and
-- member reconciliation updates.
CREATE OR REPLACE FUNCTION app.reconcile_branch_structure(p_tree uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,app AS $$
BEGIN
  WITH RECURSIVE ancestry(member_id,ancestor_id,distance,path) AS MATERIALIZED (
    SELECT m.id,m.id,0,ARRAY[m.id]
    FROM app.family_members m
    WHERE m.tree_id=p_tree AND m.deleted_at IS NULL
    UNION ALL
    SELECT a.member_id,r.parent_id,a.distance+1,a.path||r.parent_id
    FROM ancestry a
    JOIN app.parent_child_relationships r
      ON r.tree_id=p_tree AND r.child_id=a.ancestor_id AND r.deleted_at IS NULL
    WHERE NOT r.parent_id=ANY(a.path)
  ), branch_candidates AS (
    SELECT child.id child_id,parent.id parent_id,a.distance,
      row_number() OVER (
        PARTITION BY child.id ORDER BY a.distance,parent.created_at,parent.id
      ) choice
    FROM app.subfamilies child
    JOIN ancestry a ON a.member_id=child.linked_male_id AND a.distance>0
    JOIN app.subfamilies parent
      ON parent.tree_id=p_tree AND parent.linked_male_id=a.ancestor_id
     AND parent.id<>child.id AND parent.status='active' AND parent.deleted_at IS NULL
    WHERE child.tree_id=p_tree AND child.status='active' AND child.deleted_at IS NULL
  ), selected_parents AS (
    SELECT child_id,parent_id FROM branch_candidates WHERE choice=1
  ), update_branches AS (
    UPDATE app.subfamilies branch
    SET parent_subfamily_id=selected.parent_id,updated_at=now()
    FROM (
      SELECT b.id,chosen.parent_id
      FROM app.subfamilies b
      LEFT JOIN selected_parents chosen ON chosen.child_id=b.id
      WHERE b.tree_id=p_tree AND b.deleted_at IS NULL
    ) selected
    WHERE branch.id=selected.id
      AND branch.parent_subfamily_id IS DISTINCT FROM selected.parent_id
    RETURNING branch.id
  ), member_candidates AS (
    SELECT a.member_id,b.id branch_id,
      row_number() OVER (
        PARTITION BY a.member_id ORDER BY a.distance,b.created_at,b.id
      ) choice
    FROM ancestry a
    JOIN app.subfamilies b
      ON b.tree_id=p_tree AND b.linked_male_id=a.ancestor_id
     AND b.status='active' AND b.deleted_at IS NULL
  ), selected_members AS (
    SELECT member_id,branch_id FROM member_candidates WHERE choice=1
  )
  UPDATE app.family_members member
  SET subfamily_id=selected.branch_id,updated_at=now()
  FROM (
    SELECT m.id,chosen.branch_id
    FROM app.family_members m
    LEFT JOIN selected_members chosen ON chosen.member_id=m.id
    WHERE m.tree_id=p_tree AND m.deleted_at IS NULL
  ) selected
  WHERE member.id=selected.id
    AND member.subfamily_id IS DISTINCT FROM selected.branch_id;
END $$;

-- Match indexes to production query shapes and remove indexes made redundant
-- by later migrations.
DROP INDEX app.sessions_user_idx;
CREATE INDEX sessions_user_created_idx
  ON app.sessions(user_id,created_at DESC);

DROP INDEX app.auth_attempts_ip_idx;
CREATE INDEX auth_attempts_type_ip_idx
  ON app.auth_attempts(attempt_type,ip_address,occurred_at DESC)
  WHERE ip_address IS NOT NULL;

DROP INDEX app.family_members_name_en_trgm_idx;
DROP INDEX app.family_members_name_ar_trgm_idx;
CREATE INDEX family_members_name_en_trgm_idx
  ON app.family_members USING gin(name_en gin_trgm_ops)
  WHERE deleted_at IS NULL;
CREATE INDEX family_members_name_ar_trgm_idx
  ON app.family_members USING gin(name_ar gin_trgm_ops)
  WHERE deleted_at IS NULL;

DROP INDEX app.oauth_accounts_user_idx;
DROP INDEX app.tree_activity_tree_created_idx;

CREATE INDEX password_reset_tokens_active_user_idx
  ON app.password_reset_tokens(user_id,created_at DESC)
  WHERE consumed_at IS NULL AND invalidated_at IS NULL;
CREATE INDEX subfamily_attachments_file_idx
  ON app.subfamily_attachments(file_id);
CREATE INDEX member_media_file_idx
  ON app.member_media(file_id);
CREATE INDEX cloudinary_assets_tree_member_idx
  ON app.cloudinary_assets(tree_id,member_id)
  WHERE member_id IS NOT NULL;
CREATE INDEX tree_complaints_open_serious_idx
  ON app.tree_complaints(tree_id)
  WHERE status='open' AND serious;

-- Partition maintenance evacuates the default partition before attaching a
-- monthly range, preventing matching default rows from blocking attachment.
CREATE OR REPLACE FUNCTION audit.ensure_month_partition(p_month date)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,audit AS $$
DECLARE
  start_date date:=date_trunc('month',p_month)::date;
  end_date date;
  table_name text;
  moved_rows bigint;
BEGIN
  end_date:=(start_date+interval '1 month')::date;
  table_name:='events_'||to_char(start_date,'YYYY_MM');

  PERFORM pg_advisory_xact_lock(hashtextextended('audit.events.partition-maintenance',0));
  LOCK TABLE audit.events_default IN ACCESS EXCLUSIVE MODE;

  CREATE TEMP TABLE IF NOT EXISTS audit_partition_buffer
    ON COMMIT DROP AS SELECT * FROM audit.events WITH NO DATA;
  TRUNCATE pg_temp.audit_partition_buffer;

  WITH moved AS (
    DELETE FROM audit.events_default
    WHERE occurred_at>=start_date AND occurred_at<end_date
    RETURNING *
  )
  INSERT INTO pg_temp.audit_partition_buffer SELECT * FROM moved;
  GET DIAGNOSTICS moved_rows=ROW_COUNT;

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS audit.%I PARTITION OF audit.events FOR VALUES FROM (%L) TO (%L)',
    table_name,start_date,end_date
  );

  INSERT INTO audit.events SELECT * FROM pg_temp.audit_partition_buffer;
  RETURN moved_rows;
END $$;

CREATE OR REPLACE FUNCTION audit.create_month_partition(p_month date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,audit AS $$
BEGIN
  PERFORM audit.ensure_month_partition(p_month);
END $$;

CREATE OR REPLACE FUNCTION audit.maintain_partitions(
  p_reference_date date DEFAULT current_date,
  p_months_ahead integer DEFAULT 2
) RETURNS TABLE(partition_month date,moved_rows bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,audit AS $$
DECLARE month_to_prepare date;
BEGIN
  IF p_months_ahead<1 OR p_months_ahead>12 THEN
    RAISE EXCEPTION 'p_months_ahead must be between 1 and 12';
  END IF;

  FOR month_to_prepare IN
    SELECT DISTINCT date_trunc('month',occurred_at)::date
    FROM audit.events_default
    UNION
    SELECT (date_trunc('month',p_reference_date)::date+(offset_value||' months')::interval)::date
    FROM generate_series(0,p_months_ahead-1) offset_value
    ORDER BY 1
  LOOP
    partition_month:=month_to_prepare;
    moved_rows:=audit.ensure_month_partition(month_to_prepare);
    RETURN NEXT;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION audit.ensure_month_partition(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.create_month_partition(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.maintain_partitions(date,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.maintain_partitions(date,integer) TO ancestors_app;

-- Leave the database with historical default rows drained and current/next
-- month partitions ready before application traffic arrives.
SELECT * FROM audit.maintain_partitions(current_date,2);

COMMIT;
