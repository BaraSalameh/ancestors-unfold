BEGIN;

CREATE OR REPLACE FUNCTION app.is_unattached_member(p_tree uuid,p_member uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.family_members m
    WHERE m.tree_id=p_tree AND m.id=p_member AND m.deleted_at IS NULL
      AND m.subfamily_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM app.parent_child_relationships r
        WHERE r.tree_id=p_tree AND r.deleted_at IS NULL
          AND (r.parent_id=p_member OR r.child_id=p_member)
      )
      AND NOT EXISTS (
        SELECT 1 FROM app.union_partners p
        JOIN app.unions u ON u.id=p.union_id
        WHERE p.tree_id=p_tree AND p.member_id=p_member AND u.deleted_at IS NULL
      )
  )
$$;

CREATE OR REPLACE FUNCTION app.is_owned_unattached_member(p_tree uuid,p_member uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.family_members m
    WHERE m.tree_id=p_tree AND m.id=p_member
      AND m.created_by=app.current_user_id()
      AND app.is_unattached_member(p_tree,p_member)
  )
$$;

CREATE OR REPLACE FUNCTION app.can_edit_member(p_tree uuid,p_member uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app.has_tree_role(p_tree,'owner','administrator','editor') OR EXISTS(
    SELECT 1 FROM app.branch_grants g
    WHERE g.tree_id=p_tree AND g.user_id=app.current_user_id()
      AND g.role='branch_editor' AND g.revoked_at IS NULL
      AND (g.expires_at IS NULL OR g.expires_at>now())
      AND (
        p_member IN (SELECT member_id FROM app.branch_members(p_tree,app.current_user_id()))
        OR app.is_owned_unattached_member(p_tree,p_member)
      )
  )
$$;

DROP POLICY member_read ON app.family_members;
CREATE POLICY member_read ON app.family_members FOR SELECT USING (app.can_view_tree(tree_id));

DROP POLICY member_insert ON app.family_members;
CREATE POLICY member_insert ON app.family_members FOR INSERT WITH CHECK (
  app.has_tree_role(tree_id,'owner','administrator','editor') OR
  subfamily_id IN (SELECT subfamily_id FROM app.branch_subfamilies(tree_id,app.current_user_id())) OR
  (
    subfamily_id IS NULL AND created_by=app.current_user_id() AND EXISTS (
      SELECT 1 FROM app.branch_grants g
      WHERE g.tree_id=family_members.tree_id AND g.user_id=app.current_user_id()
        AND g.role='branch_editor' AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at>now())
    )
  )
);

DROP POLICY member_update ON app.family_members;
CREATE POLICY member_update ON app.family_members FOR UPDATE
  USING (app.can_edit_member(tree_id,id))
  WITH CHECK (
    app.has_tree_role(tree_id,'owner','administrator','editor')
    OR app.can_edit_member(tree_id,id)
    OR (
      created_by=app.current_user_id()
      AND subfamily_id IN (
        SELECT subfamily_id FROM app.branch_subfamilies(tree_id,app.current_user_id())
      )
    )
  );

COMMIT;
