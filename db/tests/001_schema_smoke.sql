-- Run after migrations with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/tests/001_schema_smoke.sql
BEGIN;

DO $$
DECLARE
  oauth_user uuid := gen_random_uuid();
BEGIN
  INSERT INTO app.users(id,email,full_name_en,full_name_ar,status,email_verified_at)
  VALUES(oauth_user,'oauth-reset@example.test','OAuth user','OAuth user','active',now());

  INSERT INTO app.password_credentials AS credentials(user_id,password_hash)
  VALUES(oauth_user,'$argon2id$first')
  ON CONFLICT (user_id) DO UPDATE SET
    password_hash=EXCLUDED.password_hash,
    credential_version=credentials.credential_version+1,
    password_changed_at=now(),updated_at=now();

  INSERT INTO app.password_credentials AS credentials(user_id,password_hash)
  VALUES(oauth_user,'$argon2id$second')
  ON CONFLICT (user_id) DO UPDATE SET
    password_hash=EXCLUDED.password_hash,
    credential_version=credentials.credential_version+1,
    password_changed_at=now(),updated_at=now();

  IF NOT EXISTS (
    SELECT 1 FROM app.password_credentials
    WHERE user_id=oauth_user AND password_hash='$argon2id$second' AND credential_version=2
  ) THEN
    RAISE EXCEPTION 'password reset credential upsert failed';
  END IF;
END $$;

DO $$
DECLARE
  owner_id uuid := gen_random_uuid();
  editor_id uuid := gen_random_uuid();
  v_tree_id uuid := gen_random_uuid();
  father_id uuid := gen_random_uuid();
  mother_id uuid := gen_random_uuid();
  child_id uuid := gen_random_uuid();
  english_only_id uuid := gen_random_uuid();
  arabic_only_id uuid := gen_random_uuid();
  sf_root uuid := gen_random_uuid();
  sf_child uuid := gen_random_uuid();
BEGIN
  INSERT INTO app.users(id,email,full_name_en,full_name_ar,status)
  VALUES (owner_id,'owner@example.test','Owner','المالك','active'),
         (editor_id,'editor@example.test','Editor','المحرر','active');
  INSERT INTO app.family_trees(id,owner_user_id,name_en) VALUES(v_tree_id,owner_id,'Test tree');
  INSERT INTO app.tree_memberships(tree_id,user_id,role) VALUES
    (v_tree_id,owner_id,'owner'),
    (v_tree_id,editor_id,'viewer');
  INSERT INTO app.family_members(id,tree_id,name_en,name_ar,gender) VALUES
    (father_id,v_tree_id,'Father','الأب','male'),(mother_id,v_tree_id,'Mother','الأم','female'),
    (child_id,v_tree_id,'Child','الطفل','male');
  INSERT INTO app.family_members(id,tree_id,name_en,name_ar,gender) VALUES
    (english_only_id,v_tree_id,'English only',NULL,'male'),
    (arabic_only_id,v_tree_id,NULL,'Arabic only','female');
  INSERT INTO app.parent_child_relationships(tree_id,child_id,parent_id,parent_role) VALUES
    (v_tree_id,child_id,father_id,'father'),(v_tree_id,child_id,mother_id,'mother');
  INSERT INTO app.subfamilies(id,tree_id,name_en,linked_male_id) VALUES(sf_root,v_tree_id,'Root',father_id);
  INSERT INTO app.subfamilies(id,tree_id,name_en,parent_subfamily_id) VALUES(sf_child,v_tree_id,'Child branch',sf_root);
  INSERT INTO app.branch_grants(user_id,tree_id,root_subfamily_id,role,granted_by)
    VALUES(editor_id,v_tree_id,sf_root,'branch_editor',owner_id);

  IF NOT EXISTS (SELECT 1 FROM app.branch_members(v_tree_id,editor_id) WHERE member_id=child_id) THEN
    RAISE EXCEPTION 'descendant branch membership was not inferred';
  END IF;
  IF (SELECT count(*) FROM app.branch_subfamilies(v_tree_id,editor_id)) <> 2 THEN
    RAISE EXCEPTION 'nested sub-family inheritance failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM audit.events e WHERE e.tree_id=v_tree_id AND e.entity_type='family_members') THEN
    RAISE EXCEPTION 'domain audit trigger did not write an event';
  END IF;
END $$;

-- Deferred genealogy cycle must fail before this savepoint can be released.
DO $$
DECLARE t uuid; a uuid; b uuid;
BEGIN
  SELECT ft.id INTO t FROM app.family_trees ft JOIN app.users u ON u.id=ft.owner_user_id WHERE u.email='owner@example.test';
  SELECT id INTO a FROM app.family_members WHERE tree_id=t AND name_en='Father';
  SELECT id INTO b FROM app.family_members WHERE tree_id=t AND name_en='Child';
  BEGIN
    SET CONSTRAINTS app.validate_parent_graph DEFERRED;
    INSERT INTO app.parent_child_relationships(tree_id,child_id,parent_id,parent_role)
      VALUES(t,a,b,'father');
    SET CONSTRAINTS app.validate_parent_graph IMMEDIATE;
    RAISE EXCEPTION 'cycle should have been rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'cycle should have been rejected' THEN RAISE; END IF;
  END;
END $$;

-- Tree discovery must enforce request-context authorization even for roles that bypass RLS.
DO $$
DECLARE
  owner_a uuid := gen_random_uuid();
  owner_b uuid := gen_random_uuid();
  shared_user uuid := gen_random_uuid();
  tree_a uuid := gen_random_uuid();
  tree_b uuid := gen_random_uuid();
  branch_root uuid := gen_random_uuid();
BEGIN
  INSERT INTO app.users(id,email,full_name_en,full_name_ar,status) VALUES
    (owner_a,'tree-owner-a@example.test','Tree owner A','Tree owner A','active'),
    (owner_b,'tree-owner-b@example.test','Tree owner B','Tree owner B','active'),
    (shared_user,'tree-shared@example.test','Shared user','Shared user','active');

  INSERT INTO app.family_trees(id,owner_user_id,name_en) VALUES
    (tree_a,owner_a,'Owner A tree'),
    (tree_b,owner_b,'Owner B tree');
  INSERT INTO app.tree_memberships(tree_id,user_id,role) VALUES
    (tree_a,owner_a,'owner'),
    (tree_b,owner_b,'owner');
  INSERT INTO app.subfamilies(id,tree_id,name_en) VALUES(branch_root,tree_a,'Shared branch');

  PERFORM app.set_request_context(owner_a,NULL,gen_random_uuid());
  IF (SELECT count(*) FROM app.family_trees t WHERE t.deleted_at IS NULL AND app.can_view_tree(t.id)) <> 1
     OR NOT app.can_view_tree(tree_a) OR app.can_view_tree(tree_b) THEN
    RAISE EXCEPTION 'tree listing exposed a tree belonging to another owner';
  END IF;

  INSERT INTO app.tree_memberships(tree_id,user_id,role)
    VALUES(tree_a,shared_user,'viewer');
  PERFORM app.set_request_context(shared_user,NULL,gen_random_uuid());
  IF NOT app.can_view_tree(tree_a) THEN
    RAISE EXCEPTION 'active tree membership did not make the tree visible';
  END IF;
  UPDATE app.tree_memberships
    SET revoked_at=now(),revoked_by=owner_a
    WHERE tree_id=tree_a AND user_id=shared_user AND role='viewer';
  IF app.can_view_tree(tree_a) THEN
    RAISE EXCEPTION 'revoked tree membership still made the tree visible';
  END IF;

  UPDATE app.tree_memberships
    SET revoked_at=NULL,revoked_by=NULL,
        granted_at=now()-interval '2 days',expires_at=now()-interval '1 day'
    WHERE tree_id=tree_a AND user_id=shared_user AND role='viewer';
  IF app.can_view_tree(tree_a) THEN
    RAISE EXCEPTION 'expired tree membership still made the tree visible';
  END IF;

  INSERT INTO app.branch_grants(user_id,tree_id,root_subfamily_id,role,granted_by)
    VALUES(shared_user,tree_a,branch_root,'branch_viewer',owner_a);
  IF app.can_view_tree(tree_a) THEN
    RAISE EXCEPTION 'branch grant bypassed an expired tree affiliation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM app.branch_subfamilies(tree_a,shared_user)
    WHERE subfamily_id=branch_root
  ) THEN
    RAISE EXCEPTION 'active branch grant did not establish branch scope';
  END IF;
  UPDATE app.branch_grants
    SET revoked_at=now(),revoked_by=owner_a
    WHERE tree_id=tree_a AND user_id=shared_user;
  IF EXISTS (
    SELECT 1 FROM app.branch_subfamilies(tree_a,shared_user)
    WHERE subfamily_id=branch_root
  ) THEN
    RAISE EXCEPTION 'revoked branch grant still established branch scope';
  END IF;

  INSERT INTO app.branch_grants(
    user_id,tree_id,root_subfamily_id,role,granted_by,granted_at,expires_at
  ) VALUES(
    shared_user,tree_a,branch_root,'branch_viewer',owner_a,
    now()-interval '2 days',now()-interval '1 day'
  );
  IF EXISTS (
    SELECT 1 FROM app.branch_subfamilies(tree_a,shared_user)
    WHERE subfamily_id=branch_root
  ) THEN
    RAISE EXCEPTION 'expired branch grant still established branch scope';
  END IF;
END $$;

-- Flush prior deferred events and model an already-committed contributor before cancellation.
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

-- Collaboration invariants: one affiliation, one linked account card, and one contributor per branch.
DO $$
DECLARE
  owner_id uuid := gen_random_uuid();
  contributor_id uuid := gen_random_uuid();
  second_id uuid := gen_random_uuid();
  tree_id uuid := gen_random_uuid();
  other_tree_id uuid := gen_random_uuid();
  member_id uuid := gen_random_uuid();
  branch_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO app.users(id,email,email_verified_at,full_name_en,full_name_ar,status) VALUES
    (owner_id,'collab-owner@example.test',now(),'Collab Owner','مالك','active'),
    (contributor_id,'collab-contributor@example.test',now(),'Contributor','مساهم','active'),
    (second_id,'collab-second@example.test',now(),'Second','ثان','active');
  INSERT INTO app.family_trees(id,owner_user_id,name_en) VALUES
    (tree_id,owner_id,'Collaboration tree'),
    (other_tree_id,second_id,'Other collaboration tree');
  INSERT INTO app.tree_memberships(tree_id,user_id,role) VALUES
    (tree_id,owner_id,'owner'),
    (other_tree_id,second_id,'owner');
  INSERT INTO app.family_members(id,tree_id,name_en,name_ar,gender,linked_user_id)
    VALUES(member_id,tree_id,'Contributor','مساهم','unspecified',contributor_id);
  INSERT INTO app.tree_memberships(tree_id,user_id,role,family_member_id)
    VALUES(tree_id,contributor_id,'viewer',member_id);
  INSERT INTO app.subfamilies(id,tree_id,name_en,status)
    VALUES(branch_id,tree_id,'Contributor branch','active');
  INSERT INTO app.branch_grants(user_id,tree_id,root_subfamily_id,role,granted_by)
    VALUES(contributor_id,tree_id,branch_id,'branch_editor',owner_id);

  BEGIN
    INSERT INTO app.tree_memberships(tree_id,user_id,role)
      VALUES(other_tree_id,contributor_id,'viewer');
    RAISE EXCEPTION 'one-tree affiliation constraint was not enforced';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO app.branch_grants(user_id,tree_id,root_subfamily_id,role,granted_by)
      VALUES(second_id,tree_id,branch_id,'branch_editor',owner_id);
    RAISE EXCEPTION 'one active contributor per branch constraint was not enforced';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

END $$;

SET CONSTRAINTS ALL IMMEDIATE;

DO $$
DECLARE
  contributor_id uuid;
BEGIN
  SELECT id INTO STRICT contributor_id
  FROM app.users WHERE email='collab-contributor@example.test';
  INSERT INTO app.tree_activity(
    tree_id,branch_id,actor_user_id,action_type,target_type,target_id
  )
  SELECT m.tree_id,g.root_subfamily_id,contributor_id,
    'contributor_account_deleted','user',contributor_id
  FROM app.tree_memberships m
  LEFT JOIN app.branch_grants g
    ON g.tree_id=m.tree_id AND g.user_id=m.user_id AND g.revoked_at IS NULL
  WHERE m.user_id=contributor_id AND m.role<>'owner' AND m.revoked_at IS NULL;
  UPDATE app.family_members SET linked_user_id=NULL WHERE linked_user_id=contributor_id;
  UPDATE app.branch_grants
    SET revoked_at=now(),revoked_by=contributor_id
    WHERE user_id=contributor_id AND revoked_at IS NULL;
  UPDATE app.tree_memberships
    SET family_member_id=NULL,affiliation_status='removed',
        revoked_at=now(),revoked_by=contributor_id
    WHERE user_id=contributor_id AND role<>'owner' AND revoked_at IS NULL;
  IF EXISTS (
    SELECT 1 FROM app.branch_grants
    WHERE user_id=contributor_id AND revoked_at IS NULL
  ) OR EXISTS (
    SELECT 1 FROM app.tree_memberships
    WHERE user_id=contributor_id AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'contributor cancellation did not revoke active access';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM app.tree_activity
    WHERE actor_user_id=contributor_id
      AND action_type='contributor_account_deleted'
  ) THEN
    RAISE EXCEPTION 'contributor cancellation activity was not recorded';
  END IF;
END $$;

SET CONSTRAINTS ALL DEFERRED;

-- Contributor member permissions: full-tree viewing, branch edits, and creator-owned drafts.
DO $$
DECLARE
  owner_id uuid := gen_random_uuid();
  contributor_id uuid := gen_random_uuid();
  other_contributor_id uuid := gen_random_uuid();
  tree_id uuid := gen_random_uuid();
  branch_id uuid := gen_random_uuid();
  branch_member_id uuid := gen_random_uuid();
  outside_member_id uuid := gen_random_uuid();
  own_draft_id uuid := gen_random_uuid();
  other_draft_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO app.users(id,email,full_name_en,full_name_ar,status) VALUES
    (owner_id,'permission-owner@example.test','Owner','Owner','active'),
    (contributor_id,'permission-contributor@example.test','Contributor','Contributor','active'),
    (other_contributor_id,'permission-other@example.test','Other contributor','Other contributor','active');
  INSERT INTO app.family_trees(id,owner_user_id,name_en)
    VALUES(tree_id,owner_id,'Permission tree');
  INSERT INTO app.tree_memberships(tree_id,user_id,role) VALUES
    (tree_id,owner_id,'owner'),
    (tree_id,contributor_id,'viewer');
  INSERT INTO app.subfamilies(id,tree_id,name_en) VALUES(branch_id,tree_id,'Assigned branch');
  INSERT INTO app.branch_grants(user_id,tree_id,root_subfamily_id,role,granted_by)
    VALUES(contributor_id,tree_id,branch_id,'branch_editor',owner_id);
  INSERT INTO app.family_members(id,tree_id,name_en,gender,subfamily_id,created_by) VALUES
    (branch_member_id,tree_id,'Branch member','unspecified',branch_id,owner_id),
    (outside_member_id,tree_id,'Outside member','unspecified',NULL,owner_id),
    (own_draft_id,tree_id,'Own draft','unspecified',NULL,contributor_id),
    (other_draft_id,tree_id,'Other draft','unspecified',NULL,other_contributor_id);

  PERFORM app.set_request_context(contributor_id,NULL,gen_random_uuid());
  IF NOT app.can_view_tree(tree_id) THEN
    RAISE EXCEPTION 'contributor could not view the assigned tree';
  END IF;
  IF NOT app.can_edit_member(tree_id,branch_member_id) THEN
    RAISE EXCEPTION 'contributor could not edit an assigned branch member';
  END IF;
  IF NOT app.can_edit_member(tree_id,own_draft_id) THEN
    RAISE EXCEPTION 'contributor could not edit their own unattached draft';
  END IF;
  IF app.can_edit_member(tree_id,outside_member_id)
     OR app.can_edit_member(tree_id,other_draft_id) THEN
    RAISE EXCEPTION 'contributor could edit a protected member';
  END IF;
  PERFORM app.set_request_context(NULL,NULL,gen_random_uuid());
END $$;

ROLLBACK;
