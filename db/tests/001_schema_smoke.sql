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
  INSERT INTO app.tree_memberships(tree_id,user_id,role) VALUES(v_tree_id,owner_id,'owner');
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

  INSERT INTO app.tree_memberships(tree_id,user_id,role,granted_at,expires_at)
    VALUES(tree_a,shared_user,'viewer',now()-interval '2 days',now()-interval '1 day');
  IF app.can_view_tree(tree_a) THEN
    RAISE EXCEPTION 'expired tree membership still made the tree visible';
  END IF;

  INSERT INTO app.branch_grants(user_id,tree_id,root_subfamily_id,role,granted_by)
    VALUES(shared_user,tree_a,branch_root,'branch_viewer',owner_a);
  IF NOT app.can_view_tree(tree_a) THEN
    RAISE EXCEPTION 'active branch grant did not make the tree visible';
  END IF;
  UPDATE app.branch_grants
    SET revoked_at=now(),revoked_by=owner_a
    WHERE tree_id=tree_a AND user_id=shared_user;
  IF app.can_view_tree(tree_a) THEN
    RAISE EXCEPTION 'revoked branch grant still made the tree visible';
  END IF;

  INSERT INTO app.branch_grants(
    user_id,tree_id,root_subfamily_id,role,granted_by,granted_at,expires_at
  ) VALUES(
    shared_user,tree_a,branch_root,'branch_viewer',owner_a,
    now()-interval '2 days',now()-interval '1 day'
  );
  IF app.can_view_tree(tree_a) THEN
    RAISE EXCEPTION 'expired branch grant still made the tree visible';
  END IF;
END $$;

ROLLBACK;
