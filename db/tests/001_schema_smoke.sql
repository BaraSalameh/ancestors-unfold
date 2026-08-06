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
  IF NOT EXISTS (
    SELECT 1 FROM app.family_trees
    WHERE id=v_tree_id AND visibility='private' AND country_code IS NULL
  ) THEN
    RAISE EXCEPTION 'family metadata defaults are invalid';
  END IF;
  UPDATE app.family_trees SET visibility='public',country_code='JO' WHERE id=v_tree_id;
  IF NOT EXISTS (
    SELECT 1 FROM app.family_trees
    WHERE id=v_tree_id AND visibility='public' AND country_code='JO'
  ) THEN
    RAISE EXCEPTION 'family metadata update failed';
  END IF;
  BEGIN
    UPDATE app.family_trees SET visibility='unlisted' WHERE id=v_tree_id;
    RAISE EXCEPTION 'invalid family visibility should have been rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE app.family_trees SET country_code='JOR' WHERE id=v_tree_id;
    RAISE EXCEPTION 'invalid country code should have been rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
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
    VALUES(member_id,tree_id,'Contributor','مساهم','male',contributor_id);
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
  cancellation_count integer;
  recorded_name text;
BEGIN
  SELECT id INTO STRICT contributor_id
  FROM app.users WHERE email='collab-contributor@example.test';
  INSERT INTO app.tree_activity(
    tree_id,branch_id,actor_user_id,subject_user_id,action_type,target_type,target_id
  )
  SELECT m.tree_id,g.root_subfamily_id,contributor_id,contributor_id,
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
  UPDATE app.users SET
    email='deleted+'||id::text||'@invalid.local',
    full_name_en='Deleted User',full_name_ar='مستخدم محذوف',
    status='deleted',deleted_at=now()
  WHERE id=contributor_id;
  IF EXISTS (
    SELECT 1 FROM app.branch_grants
    WHERE user_id=contributor_id AND revoked_at IS NULL
  ) OR EXISTS (
    SELECT 1 FROM app.tree_memberships
    WHERE user_id=contributor_id AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'contributor cancellation did not revoke active access';
  END IF;
  SELECT count(*),max(actor_name_en)
    INTO cancellation_count,recorded_name
  FROM app.tree_activity
    WHERE actor_user_id=contributor_id
      AND action_type='contributor_account_deleted';
  IF cancellation_count<>1 OR recorded_name<>'Contributor' THEN
    RAISE EXCEPTION 'contributor cancellation activity was not recorded with its identity';
  END IF;
END $$;

SET CONSTRAINTS ALL DEFERRED;

DO $$
BEGIN
  IF to_regclass('app.tree_snapshots') IS NULL THEN
    RAISE EXCEPTION 'tree snapshot history table is missing';
  END IF;
  IF to_regprocedure('app.canonical_tree_snapshot(uuid)') IS NULL
     OR to_regprocedure('app.store_tree_snapshot(uuid,bigint,bigint,uuid)') IS NULL
     OR to_regprocedure('app.saved_snapshot_version(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'tree snapshot history functions are missing';
  END IF;
END $$;

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
    (branch_member_id,tree_id,'Branch member','male',branch_id,owner_id),
    (outside_member_id,tree_id,'Outside member','female',NULL,owner_id),
    (own_draft_id,tree_id,'Own draft','male',NULL,contributor_id),
    (other_draft_id,tree_id,'Other draft','female',NULL,other_contributor_id);

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

-- Activity identities are immutable event-time snapshots.
DO $$
DECLARE
  actor_id uuid := gen_random_uuid();
  subject_id uuid := gen_random_uuid();
  tree_id uuid := gen_random_uuid();
  activity_id uuid;
  recorded_actor text;
  recorded_subject text;
BEGIN
  IF to_regclass('app.tree_activity_tree_order_idx') IS NULL
     OR to_regclass('app.tree_activity_identity_search_idx') IS NULL THEN
    RAISE EXCEPTION 'activity pagination/search indexes are missing';
  END IF;
  INSERT INTO app.users(id,email,full_name_en,full_name_ar,status) VALUES
    (actor_id,'activity-actor@example.test','Original actor','المُنفّذ الأصلي','active'),
    (subject_id,'activity-subject@example.test','Original subject','المستلم الأصلي','active');
  INSERT INTO app.family_trees(id,owner_user_id,name_en)
    VALUES(tree_id,actor_id,'Activity tree');
  INSERT INTO app.tree_memberships(tree_id,user_id,role)
    VALUES(tree_id,actor_id,'owner');
  PERFORM app.set_request_context(actor_id,NULL,gen_random_uuid());
  INSERT INTO app.tree_activity(
    tree_id,actor_user_id,subject_user_id,action_type,target_type,target_id
  ) VALUES(
    tree_id,actor_id,subject_id,'attribution_test','user',subject_id
  ) RETURNING id INTO activity_id;
  UPDATE app.users SET
    email='deleted+'||id::text||'@invalid.local',
    full_name_en='Deleted User',full_name_ar='مستخدم محذوف',
    status='deleted',deleted_at=now()
  WHERE id=actor_id;
  UPDATE app.users SET full_name_en='Renamed subject' WHERE id=subject_id;
  SELECT actor_name_en,subject_name_en
    INTO recorded_actor,recorded_subject
  FROM app.tree_activity WHERE id=activity_id;
  IF recorded_actor<>'Original actor' OR recorded_subject<>'Original subject' THEN
    RAISE EXCEPTION 'activity identity snapshots changed with live profiles';
  END IF;
  PERFORM app.set_request_context(NULL,NULL,gen_random_uuid());
END $$;

-- Ownership transfer verification and acceptance use independent expiry windows.
DO $$
DECLARE
  has_verification_expiry boolean;
  has_expiry_check boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='app' AND table_name='ownership_transfers'
      AND column_name='verification_expires_at'
      AND data_type='timestamp with time zone'
  ) INTO has_verification_expiry;
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid='app.ownership_transfers'::regclass
      AND conname='ownership_transfers_verification_expiry_check'
  ) INTO has_expiry_check;
  IF NOT has_verification_expiry OR NOT has_expiry_check THEN
    RAISE EXCEPTION 'ownership transfer verification expiry schema is incomplete';
  END IF;
END $$;

-- Analysis storage and canonical per-root scope remain permission-bound.
DO $$
DECLARE
  v_owner_id uuid := gen_random_uuid();
  v_contributor_id uuid := gen_random_uuid();
  v_other_contributor_id uuid := gen_random_uuid();
  v_outsider_id uuid := gen_random_uuid();
  v_tree_id uuid := gen_random_uuid();
  v_assigned_branch uuid := gen_random_uuid();
  v_outside_branch uuid := gen_random_uuid();
  v_assigned_member uuid := gen_random_uuid();
  v_outside_member uuid := gen_random_uuid();
  v_spouse_member uuid := gen_random_uuid();
  v_union uuid := gen_random_uuid();
  v_view_id uuid;
  v_affected integer;
BEGIN
  IF to_regclass('app.analysis_saved_views') IS NULL
     OR to_regclass('app.family_members_analysis_active_idx') IS NULL
     OR to_regprocedure('app.branch_members_for_root(uuid,uuid)') IS NULL
     OR to_regprocedure('app.can_analyze_tree(uuid)') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname='app' AND tablename='analysis_saved_views'
         AND policyname='analysis_saved_view_select' AND qual LIKE '%can_analyze_tree%'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname='app' AND tablename='analysis_saved_views'
         AND policyname='analysis_saved_view_update'
         AND qual LIKE '%has_tree_role%' AND qual LIKE '%user_id%'
     ) THEN
    RAISE EXCEPTION 'analysis schema is incomplete';
  END IF;
  INSERT INTO app.users(id,email,full_name_en,full_name_ar,status) VALUES
    (v_owner_id,'analysis-owner@example.test','Analysis owner','Analysis owner','active'),
    (v_contributor_id,'analysis-contributor@example.test','Analysis contributor','Analysis contributor','active'),
    (v_other_contributor_id,'analysis-other@example.test','Other contributor','Other contributor','active'),
    (v_outsider_id,'analysis-outsider@example.test','Analysis outsider','Analysis outsider','active');
  INSERT INTO app.family_trees(id,owner_user_id,name_en) VALUES(v_tree_id,v_owner_id,'Analysis tree');
  INSERT INTO app.tree_memberships(tree_id,user_id,role) VALUES
    (v_tree_id,v_owner_id,'owner'),
    (v_tree_id,v_contributor_id,'viewer'),
    (v_tree_id,v_other_contributor_id,'viewer');
  INSERT INTO app.subfamilies(id,tree_id,name_en) VALUES
    (v_assigned_branch,v_tree_id,'Assigned analysis branch'),
    (v_outside_branch,v_tree_id,'Outside analysis branch');
  INSERT INTO app.family_members(id,tree_id,name_en,gender,subfamily_id) VALUES
    (v_assigned_member,v_tree_id,'Assigned analysis member','male',v_assigned_branch),
    (v_outside_member,v_tree_id,'Outside analysis member','female',v_outside_branch);
  INSERT INTO app.family_members(id,tree_id,name_en,gender)
    VALUES(v_spouse_member,v_tree_id,'Marriage-only spouse','female');
  INSERT INTO app.unions(id,tree_id) VALUES(v_union,v_tree_id);
  INSERT INTO app.union_partners(union_id,tree_id,member_id,display_order) VALUES
    (v_union,v_tree_id,v_assigned_member,0),(v_union,v_tree_id,v_spouse_member,1);
  INSERT INTO app.branch_grants(user_id,tree_id,root_subfamily_id,role,granted_by)
    VALUES
      (v_contributor_id,v_tree_id,v_assigned_branch,'branch_editor',v_owner_id),
      (v_other_contributor_id,v_tree_id,v_outside_branch,'branch_editor',v_owner_id);

  PERFORM app.set_request_context(v_contributor_id,NULL,gen_random_uuid());
  IF NOT app.can_analyze_tree(v_tree_id) OR NOT EXISTS (
    SELECT 1 FROM app.branch_members_for_root(v_tree_id,v_assigned_branch) WHERE member_id=v_assigned_member
  ) OR NOT EXISTS (
    SELECT 1 FROM app.branch_members_for_root(v_tree_id,v_outside_branch) WHERE member_id=v_outside_member
  ) OR EXISTS (
    SELECT 1 FROM app.branch_members_for_root(v_tree_id,v_assigned_branch) WHERE member_id=v_spouse_member
  ) THEN
    RAISE EXCEPTION 'shared analysis scope or lineage membership is incorrect';
  END IF;
  INSERT INTO app.analysis_saved_views(tree_id,user_id,name,definition)
    VALUES(v_tree_id,v_contributor_id,'Adults',jsonb_build_object('filters',jsonb_build_object(),'sort','name','direction','asc'))
    RETURNING id INTO v_view_id;

  PERFORM app.set_request_context(v_other_contributor_id,NULL,gen_random_uuid());
  IF NOT EXISTS (
    SELECT 1 FROM app.analysis_saved_views v
    WHERE v.tree_id=v_tree_id AND v.user_id=v_contributor_id AND v.name='Adults'
  ) THEN
    RAISE EXCEPTION 'analysis saved view was not shared';
  END IF;
  BEGIN
    INSERT INTO app.analysis_saved_views(tree_id,user_id,name,definition)
      VALUES(v_tree_id,v_other_contributor_id,'adults',jsonb_build_object('filters',jsonb_build_object(),'sort','name','direction','asc'));
    RAISE EXCEPTION 'shared saved-view names should be tree-unique';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  PERFORM app.set_request_context(v_owner_id,NULL,gen_random_uuid());
  UPDATE app.analysis_saved_views SET name='Owner managed' WHERE id=v_view_id;
  GET DIAGNOSTICS v_affected=ROW_COUNT;
  IF v_affected<>1 THEN
    RAISE EXCEPTION 'owner could not manage a contributor saved view';
  END IF;
  BEGIN
    UPDATE app.analysis_saved_views SET user_id=v_owner_id WHERE id=v_view_id;
    RAISE EXCEPTION 'saved-view creator should be immutable';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='saved-view creator should be immutable' THEN RAISE; END IF;
  END;

  PERFORM app.set_request_context(v_outsider_id,NULL,gen_random_uuid());
  IF app.can_analyze_tree(v_tree_id) OR EXISTS (
    SELECT 1 FROM app.branch_members_for_root(v_tree_id,v_assigned_branch)
  ) THEN
    RAISE EXCEPTION 'analysis data was exposed outside the tree';
  END IF;
  PERFORM app.set_request_context(NULL,NULL,gen_random_uuid());
END $$;

-- Lifecycle age semantics stay exact at birthdays, death, leap days, and unknown dates.
DO $$
BEGIN
  IF extract(year FROM age(date '2026-08-03',date '2008-08-03'))::integer <> 18
     OR extract(year FROM age(date '2026-08-02',date '2008-08-03'))::integer <> 17
     OR extract(year FROM age(date '2025-03-01',date '2008-02-29'))::integer <> 17
     OR extract(year FROM age(date '2026-03-01',date '2008-02-29'))::integer <> 18
     OR extract(year FROM age(date '2020-01-01',date '1980-01-01'))::integer <> 40 THEN
    RAISE EXCEPTION 'analysis lifecycle age semantics regressed';
  END IF;
  IF (CASE WHEN NULL::date IS NULL THEN NULL
      ELSE extract(year FROM age(date '2026-08-03',NULL::date))::integer END) IS NOT NULL THEN
    RAISE EXCEPTION 'analysis unknown birth date must retain unknown age';
  END IF;
END $$;

-- Life status remains independent from an optional death date.
DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_tree uuid := gen_random_uuid();
  v_living uuid := gen_random_uuid();
  v_unknown_death uuid := gen_random_uuid();
  v_dated_death uuid := gen_random_uuid();
BEGIN
  INSERT INTO app.users(id,email,full_name_en,full_name_ar,status)
    VALUES(v_owner,'death-status@example.test','Death Status Owner','Death Status Owner','active');
  INSERT INTO app.family_trees(id,owner_user_id,name_en)
    VALUES(v_tree,v_owner,'Death status tree');
  INSERT INTO app.family_members(id,tree_id,name_en,gender,is_deceased)
    VALUES(v_unknown_death,v_tree,'Unknown death date','male',true);
  INSERT INTO app.family_members(id,tree_id,name_en,gender)
    VALUES(v_living,v_tree,'Living member','female');
  INSERT INTO app.family_members(id,tree_id,name_en,gender,death_date,is_deceased)
    VALUES(v_dated_death,v_tree,'Known death date','male',date '2020-01-02',true);

  IF (SELECT is_deceased FROM app.family_members WHERE id=v_living)
     OR NOT (SELECT is_deceased AND death_date IS NULL FROM app.family_members WHERE id=v_unknown_death)
     OR NOT (SELECT is_deceased FROM app.family_members WHERE id=v_dated_death)
     OR (SELECT citizen_status <> 'resident' FROM app.family_members WHERE id=v_living) THEN
    RAISE EXCEPTION 'independent deceased status was not persisted';
  END IF;

  BEGIN
    INSERT INTO app.family_members(tree_id,name_en,gender)
      VALUES(v_tree,'Unspecified member','unspecified');
    RAISE EXCEPTION 'unspecified member gender should have been rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE app.users SET profile_gender='unspecified' WHERE id=v_owner;
    RAISE EXCEPTION 'unspecified account gender should have been rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO app.family_members(tree_id,name_en,gender,death_date,is_deceased)
      VALUES(v_tree,'Contradictory status','female',date '2020-01-02',false);
    RAISE EXCEPTION 'living member with a death date should have been rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- Active branch parents and member tags are derived from the nearest branch root.
DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_tree uuid := gen_random_uuid();
  v_grandfather uuid := gen_random_uuid();
  v_father uuid := gen_random_uuid();
  v_child uuid := gen_random_uuid();
  v_outer uuid := gen_random_uuid();
  v_inner uuid := gen_random_uuid();
BEGIN
  INSERT INTO app.users(id,email,full_name_en,full_name_ar,status)
    VALUES(v_owner,'automatic-branches@example.test','Branch Owner','Branch Owner','active');
  INSERT INTO app.family_trees(id,owner_user_id,name_en) VALUES(v_tree,v_owner,'Automatic branches');
  INSERT INTO app.tree_memberships(tree_id,user_id,role) VALUES(v_tree,v_owner,'owner');
  INSERT INTO app.family_members(id,tree_id,name_en,gender) VALUES
    (v_grandfather,v_tree,'Grandfather','male'),
    (v_father,v_tree,'Father','male'),
    (v_child,v_tree,'Child','female');
  INSERT INTO app.parent_child_relationships(tree_id,child_id,parent_id,parent_role) VALUES
    (v_tree,v_father,v_grandfather,'father'),
    (v_tree,v_child,v_father,'father');
  INSERT INTO app.subfamilies(id,tree_id,name_en,linked_male_id,created_at) VALUES
    (v_outer,v_tree,'Outer',v_grandfather,now()-interval '1 day'),
    (v_inner,v_tree,'Inner',v_father,now());

  PERFORM app.reconcile_branch_structure(v_tree);
  IF (SELECT parent_subfamily_id FROM app.subfamilies WHERE id=v_inner) IS DISTINCT FROM v_outer
     OR (SELECT subfamily_id FROM app.family_members WHERE id=v_grandfather) IS DISTINCT FROM v_outer
     OR (SELECT subfamily_id FROM app.family_members WHERE id=v_father) IS DISTINCT FROM v_inner
     OR (SELECT subfamily_id FROM app.family_members WHERE id=v_child) IS DISTINCT FROM v_inner THEN
    RAISE EXCEPTION 'nearest branch reconciliation failed';
  END IF;

  UPDATE app.subfamilies SET status='inactive',linked_male_id=NULL WHERE id=v_inner;
  PERFORM app.reconcile_branch_structure(v_tree);
  IF (SELECT subfamily_id FROM app.family_members WHERE id=v_father) IS DISTINCT FROM v_outer
     OR (SELECT subfamily_id FROM app.family_members WHERE id=v_child) IS DISTINCT FROM v_outer THEN
    RAISE EXCEPTION 'deactivated branch members were not retagged to the active ancestor';
  END IF;
END $$;

ROLLBACK;
