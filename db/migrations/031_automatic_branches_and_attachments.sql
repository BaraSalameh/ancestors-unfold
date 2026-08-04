BEGIN;

CREATE OR REPLACE FUNCTION app.reconcile_branch_structure(p_tree uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,app AS $$
BEGIN
  WITH RECURSIVE ancestry(member_id,ancestor_id,distance,path) AS (
    SELECT m.id,m.id,0,ARRAY[m.id]
    FROM app.family_members m
    WHERE m.tree_id=p_tree AND m.deleted_at IS NULL
    UNION ALL
    SELECT a.member_id,r.parent_id,a.distance+1,a.path||r.parent_id
    FROM ancestry a
    JOIN app.parent_child_relationships r
      ON r.tree_id=p_tree AND r.child_id=a.ancestor_id AND r.deleted_at IS NULL
    WHERE NOT r.parent_id=ANY(a.path)
  ), candidates AS (
    SELECT child.id child_id,parent.id parent_id,a.distance,
           row_number() OVER (
             PARTITION BY child.id
             ORDER BY a.distance,parent.created_at,parent.id
           ) choice
    FROM app.subfamilies child
    JOIN ancestry a ON a.member_id=child.linked_male_id AND a.distance>0
    JOIN app.subfamilies parent
      ON parent.tree_id=p_tree AND parent.linked_male_id=a.ancestor_id
     AND parent.id<>child.id AND parent.status='active' AND parent.deleted_at IS NULL
    WHERE child.tree_id=p_tree AND child.status='active' AND child.deleted_at IS NULL
  ), selected AS (
    SELECT child_id,parent_id FROM candidates WHERE choice=1
  )
  UPDATE app.subfamilies branch
  SET parent_subfamily_id=selected.parent_id,updated_at=now()
  FROM (SELECT b.id,chosen.parent_id
        FROM app.subfamilies b LEFT JOIN selected chosen ON chosen.child_id=b.id
        WHERE b.tree_id=p_tree AND b.deleted_at IS NULL) selected
  WHERE branch.id=selected.id
    AND branch.parent_subfamily_id IS DISTINCT FROM selected.parent_id;

  WITH RECURSIVE ancestry(member_id,ancestor_id,distance,path) AS (
    SELECT m.id,m.id,0,ARRAY[m.id]
    FROM app.family_members m
    WHERE m.tree_id=p_tree AND m.deleted_at IS NULL
    UNION ALL
    SELECT a.member_id,r.parent_id,a.distance+1,a.path||r.parent_id
    FROM ancestry a
    JOIN app.parent_child_relationships r
      ON r.tree_id=p_tree AND r.child_id=a.ancestor_id AND r.deleted_at IS NULL
    WHERE NOT r.parent_id=ANY(a.path)
  ), candidates AS (
    SELECT a.member_id,b.id branch_id,
           row_number() OVER (
             PARTITION BY a.member_id
             ORDER BY a.distance,b.created_at,b.id
           ) choice
    FROM ancestry a
    JOIN app.subfamilies b
      ON b.tree_id=p_tree AND b.linked_male_id=a.ancestor_id
     AND b.status='active' AND b.deleted_at IS NULL
  ), selected AS (
    SELECT member_id,branch_id FROM candidates WHERE choice=1
  )
  UPDATE app.family_members member
  SET subfamily_id=selected.branch_id,updated_at=now()
  FROM (SELECT m.id,chosen.branch_id
        FROM app.family_members m LEFT JOIN selected chosen ON chosen.member_id=m.id
        WHERE m.tree_id=p_tree AND m.deleted_at IS NULL) selected
  WHERE member.id=selected.id
    AND member.subfamily_id IS DISTINCT FROM selected.branch_id;
END $$;

REVOKE ALL ON FUNCTION app.reconcile_branch_structure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reconcile_branch_structure(uuid) TO ancestors_app;

CREATE TABLE app.branch_deactivation_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id uuid NOT NULL REFERENCES app.family_trees(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  verification_code_hash bytea NOT NULL CHECK (octet_length(verification_code_hash)=32),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tree_id,branch_id) REFERENCES app.subfamilies(tree_id,id) ON DELETE RESTRICT,
  CHECK (expires_at>created_at),
  CHECK (consumed_at IS NULL OR cancelled_at IS NULL)
);

CREATE UNIQUE INDEX branch_deactivation_challenges_active_uq
  ON app.branch_deactivation_challenges(tree_id,branch_id,owner_user_id)
  WHERE consumed_at IS NULL AND cancelled_at IS NULL;

ALTER TABLE app.branch_deactivation_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY branch_deactivation_owner_access
  ON app.branch_deactivation_challenges FOR ALL
  USING (owner_user_id=app.current_user_id() AND app.has_tree_role(tree_id,'owner'))
  WITH CHECK (owner_user_id=app.current_user_id() AND app.has_tree_role(tree_id,'owner'));
CREATE TRIGGER audit_branch_deactivation_challenges
AFTER INSERT OR UPDATE OR DELETE ON app.branch_deactivation_challenges
FOR EACH ROW EXECUTE FUNCTION audit.capture_change();
GRANT SELECT,INSERT,UPDATE ON app.branch_deactivation_challenges TO ancestors_app;

CREATE OR REPLACE FUNCTION app.can_access_branch_attachment(p_tree uuid,p_branch uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
  SELECT app.has_tree_role(p_tree,'owner','administrator') OR EXISTS (
    SELECT 1 FROM app.branch_grants g
    WHERE g.tree_id=p_tree AND g.root_subfamily_id=p_branch
      AND g.user_id=app.current_user_id() AND g.role='branch_editor'
      AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>now())
  )
$$;
REVOKE ALL ON FUNCTION app.can_access_branch_attachment(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_access_branch_attachment(uuid,uuid) TO ancestors_app;

CREATE OR REPLACE FUNCTION app.can_delete_branch_attachment(
  p_tree uuid,p_branch uuid,p_file uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
  SELECT app.has_tree_role(p_tree,'owner','administrator') OR EXISTS (
    SELECT 1 FROM app.files f WHERE f.id=p_file AND f.uploaded_by=app.current_user_id()
  )
$$;
REVOKE ALL ON FUNCTION app.can_delete_branch_attachment(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_delete_branch_attachment(uuid,uuid,uuid) TO ancestors_app;

ALTER TABLE app.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.subfamily_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY branch_attachment_read ON app.subfamily_attachments FOR SELECT USING (
  app.can_access_branch_attachment(tree_id,subfamily_id)
);
CREATE POLICY branch_attachment_insert ON app.subfamily_attachments FOR INSERT WITH CHECK (
  app.can_access_branch_attachment(tree_id,subfamily_id)
);
CREATE POLICY branch_attachment_delete ON app.subfamily_attachments FOR DELETE USING (
  app.can_delete_branch_attachment(tree_id,subfamily_id,file_id)
);
CREATE POLICY file_insert ON app.files FOR INSERT WITH CHECK (uploaded_by=app.current_user_id());
CREATE POLICY file_attachment_read ON app.files FOR SELECT USING (
  EXISTS (SELECT 1 FROM app.subfamily_attachments a
          WHERE a.file_id=id AND app.can_access_branch_attachment(a.tree_id,a.subfamily_id))
  OR uploaded_by=app.current_user_id()
);
CREATE POLICY file_attachment_update ON app.files FOR UPDATE USING (
  uploaded_by=app.current_user_id() OR EXISTS (
    SELECT 1 FROM app.subfamily_attachments a
    WHERE a.file_id=id AND app.has_tree_role(a.tree_id,'owner','administrator')
  )
);
CREATE POLICY file_attachment_delete ON app.files FOR DELETE USING (
  uploaded_by=app.current_user_id() OR EXISTS (
    SELECT 1 FROM app.subfamily_attachments a
    WHERE a.file_id=id AND app.has_tree_role(a.tree_id,'owner','administrator')
  )
);

GRANT SELECT,INSERT,UPDATE,DELETE ON app.files,app.subfamily_attachments TO ancestors_app;

CREATE OR REPLACE FUNCTION audit.redact(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p IS NULL THEN NULL ELSE p
    - 'password_hash' - 'token_hash' - 'encrypted_secret' - 'code_hash'
    - 'verification_code_hash' - 'normalized_value' - 'display_value' - 'address' END
$$;

DO $$
DECLARE tree_id uuid;
BEGIN
  FOR tree_id IN SELECT id FROM app.family_trees WHERE deleted_at IS NULL LOOP
    PERFORM app.reconcile_branch_structure(tree_id);
  END LOOP;
END $$;

COMMIT;
