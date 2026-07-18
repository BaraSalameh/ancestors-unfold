-- Run after migrations with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/tests/001_schema_smoke.sql
BEGIN;

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

ROLLBACK;
