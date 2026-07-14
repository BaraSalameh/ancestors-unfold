BEGIN;

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.current_session_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT nullif(current_setting('app.session_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.set_request_context(
  p_user_id uuid, p_session_id uuid, p_request_id uuid DEFAULT NULL,
  p_ip inet DEFAULT NULL, p_user_agent text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app AS $$
BEGIN
  PERFORM set_config('app.user_id', coalesce(p_user_id::text, ''), true);
  PERFORM set_config('app.session_id', coalesce(p_session_id::text, ''), true);
  PERFORM set_config('app.request_id', coalesce(p_request_id::text, ''), true);
  PERFORM set_config('app.ip', coalesce(p_ip::text, ''), true);
  PERFORM set_config('app.user_agent', coalesce(p_user_agent, ''), true);
END $$;

CREATE OR REPLACE FUNCTION app.touch_row() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  IF to_jsonb(NEW) ? 'version' THEN NEW.version := OLD.version + 1; END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','password_credentials','oauth_accounts','family_trees',
    'family_members','subfamilies','unions','external_children','member_contacts','totp_credentials']
  LOOP
    EXECUTE format('CREATE TRIGGER touch_%1$I BEFORE UPDATE ON app.%1$I FOR EACH ROW EXECUTE FUNCTION app.touch_row()', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION app.validate_subfamily() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE linked_gender app.gender;
BEGIN
  IF NEW.linked_male_id IS NOT NULL THEN
    SELECT gender INTO linked_gender FROM app.family_members
      WHERE tree_id = NEW.tree_id AND id = NEW.linked_male_id AND deleted_at IS NULL;
    IF linked_gender IS DISTINCT FROM 'male'::app.gender THEN
      RAISE EXCEPTION 'linked_male_id must reference an active male member';
    END IF;
  END IF;
  IF NEW.parent_subfamily_id IS NOT NULL AND EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_subfamily_id FROM app.subfamilies WHERE id = NEW.parent_subfamily_id
      UNION ALL
      SELECT s.id, s.parent_subfamily_id FROM app.subfamilies s
      JOIN ancestors a ON s.id = a.parent_subfamily_id
    ) SELECT 1 FROM ancestors WHERE id = NEW.id
  ) THEN RAISE EXCEPTION 'sub-family cycle detected'; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER validate_subfamily_graph
AFTER INSERT OR UPDATE OF parent_subfamily_id, linked_male_id ON app.subfamilies
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_subfamily();

CREATE OR REPLACE FUNCTION app.validate_parent_relationship() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE parent_gender app.gender;
BEGIN
  SELECT gender INTO parent_gender FROM app.family_members
    WHERE tree_id = NEW.tree_id AND id = NEW.parent_id AND deleted_at IS NULL;
  IF (NEW.parent_role = 'father' AND parent_gender <> 'male') OR
     (NEW.parent_role = 'mother' AND parent_gender <> 'female') THEN
    RAISE EXCEPTION 'parent gender does not match parent role';
  END IF;
  IF EXISTS (
    WITH RECURSIVE descendants(id) AS (
      SELECT child_id FROM app.parent_child_relationships
        WHERE tree_id = NEW.tree_id AND parent_id = NEW.child_id AND deleted_at IS NULL
      UNION
      SELECT r.child_id FROM app.parent_child_relationships r
        JOIN descendants d ON r.parent_id = d.id
        WHERE r.tree_id = NEW.tree_id AND r.deleted_at IS NULL
    ) SELECT 1 FROM descendants WHERE id = NEW.parent_id
  ) THEN RAISE EXCEPTION 'genealogy cycle detected'; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER validate_parent_graph
AFTER INSERT OR UPDATE OF child_id, parent_id, parent_role ON app.parent_child_relationships
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_parent_relationship();

CREATE OR REPLACE FUNCTION app.validate_union_partner() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE partner_count integer; male_count integer; female_count integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE m.gender='male'), count(*) FILTER (WHERE m.gender='female')
    INTO partner_count, male_count, female_count
  FROM app.union_partners p JOIN app.family_members m ON m.id=p.member_id AND m.tree_id=p.tree_id
  WHERE p.union_id=NEW.union_id;
  IF partner_count > 2 OR male_count > 1 OR female_count > 1 THEN
    RAISE EXCEPTION 'a union supports at most one male and one female partner';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER validate_union_partners
AFTER INSERT OR UPDATE ON app.union_partners DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.validate_union_partner();

CREATE OR REPLACE FUNCTION app.validate_tree_owner() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_tree uuid; v_declared uuid; v_member_owner uuid; v_count integer;
BEGIN
  v_tree := COALESCE((to_jsonb(NEW)->>'tree_id')::uuid,(to_jsonb(OLD)->>'tree_id')::uuid,
                     (to_jsonb(NEW)->>'id')::uuid,(to_jsonb(OLD)->>'id')::uuid);
  SELECT owner_user_id INTO v_declared FROM app.family_trees WHERE id=v_tree;
  IF v_declared IS NULL THEN RETURN COALESCE(NEW,OLD); END IF;
  SELECT count(*), min(user_id::text)::uuid INTO v_count,v_member_owner
  FROM app.tree_memberships WHERE tree_id=v_tree AND role='owner' AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at>now());
  IF v_count <> 1 OR v_member_owner IS DISTINCT FROM v_declared THEN
    RAISE EXCEPTION 'tree must have exactly one active membership matching owner_user_id';
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
CREATE CONSTRAINT TRIGGER validate_family_tree_owner AFTER INSERT OR UPDATE OF owner_user_id ON app.family_trees
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_tree_owner();
CREATE CONSTRAINT TRIGGER validate_tree_membership_owner AFTER INSERT OR UPDATE OR DELETE ON app.tree_memberships
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_tree_owner();

CREATE OR REPLACE FUNCTION app.has_tree_role(p_tree uuid, VARIADIC p_roles app.tree_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.tree_memberships m
    WHERE m.tree_id=p_tree AND m.user_id=app.current_user_id()
      AND m.role=ANY(p_roles) AND m.revoked_at IS NULL
      AND (m.expires_at IS NULL OR m.expires_at > now())
  )
$$;

CREATE OR REPLACE FUNCTION app.branch_subfamilies(p_tree uuid, p_user uuid)
RETURNS TABLE(subfamily_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
  WITH RECURSIVE roots(id) AS (
    SELECT root_subfamily_id FROM app.branch_grants
    WHERE tree_id=p_tree AND user_id=p_user AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
  ), branches(id) AS (
    SELECT id FROM roots UNION
    SELECT s.id FROM app.subfamilies s JOIN branches b ON s.parent_subfamily_id=b.id
    WHERE s.tree_id=p_tree AND s.deleted_at IS NULL
  ) SELECT id FROM branches
$$;

CREATE OR REPLACE FUNCTION app.branch_members(p_tree uuid, p_user uuid)
RETURNS TABLE(member_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
  WITH RECURSIVE allowed_sf(id, linked_male_id) AS (
    SELECT s.id,s.linked_male_id FROM app.subfamilies s
      JOIN app.branch_subfamilies(p_tree,p_user) b ON b.subfamily_id=s.id
  ), descendants(id) AS (
    SELECT linked_male_id FROM allowed_sf WHERE linked_male_id IS NOT NULL
    UNION
    SELECT r.child_id FROM app.parent_child_relationships r JOIN descendants d ON r.parent_id=d.id
      WHERE r.tree_id=p_tree AND r.deleted_at IS NULL
  ), direct_members(id) AS (
    SELECT m.id FROM app.family_members m JOIN allowed_sf s ON s.id=m.subfamily_id
    WHERE m.tree_id=p_tree AND m.deleted_at IS NULL
  ), core(id) AS (SELECT id FROM descendants UNION SELECT id FROM direct_members),
  spouses(id) AS (
    SELECT other.member_id FROM core c
    JOIN app.union_partners mine ON mine.member_id=c.id AND mine.tree_id=p_tree
    JOIN app.union_partners other ON other.union_id=mine.union_id
  ) SELECT id FROM core UNION SELECT id FROM spouses
$$;

CREATE OR REPLACE FUNCTION app.can_view_tree(p_tree uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.has_tree_role(p_tree,'owner','administrator','editor','viewer') OR EXISTS(
    SELECT 1 FROM app.branch_grants WHERE tree_id=p_tree AND user_id=app.current_user_id()
      AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now()))
$$;

CREATE OR REPLACE FUNCTION app.can_edit_member(p_tree uuid,p_member uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.has_tree_role(p_tree,'owner','administrator','editor') OR EXISTS(
    SELECT 1 FROM app.branch_grants g JOIN app.branch_members(p_tree,app.current_user_id()) b ON b.member_id=p_member
    WHERE g.tree_id=p_tree AND g.user_id=app.current_user_id() AND g.role='branch_editor'
      AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>now()))
$$;

CREATE OR REPLACE FUNCTION app.can_read_contacts(p_tree uuid,p_member uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.has_tree_role(p_tree,'owner','administrator') OR EXISTS(
    SELECT 1 FROM app.branch_grants g JOIN app.branch_members(p_tree,app.current_user_id()) b ON b.member_id=p_member
    WHERE g.tree_id=p_tree AND g.user_id=app.current_user_id() AND g.can_read_contacts
      AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>now()))
$$;

CREATE OR REPLACE FUNCTION app.can_write_contacts(p_tree uuid,p_member uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.has_tree_role(p_tree,'owner','administrator') OR EXISTS(
    SELECT 1 FROM app.branch_grants g JOIN app.branch_members(p_tree,app.current_user_id()) b ON b.member_id=p_member
    WHERE g.tree_id=p_tree AND g.user_id=app.current_user_id() AND g.can_write_contacts
      AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>now()))
$$;

CREATE OR REPLACE FUNCTION audit.redact(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p IS NULL THEN NULL ELSE p
    - 'password_hash' - 'token_hash' - 'encrypted_secret' - 'code_hash'
    - 'normalized_value' - 'display_value' - 'address' END
$$;

CREATE OR REPLACE FUNCTION audit.capture_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,audit AS $$
DECLARE oldj jsonb; newj jsonb; entity uuid; tree uuid;
BEGIN
  oldj := CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  newj := CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  entity := COALESCE((newj->>'id')::uuid,(oldj->>'id')::uuid,(newj->>'user_id')::uuid,(oldj->>'user_id')::uuid);
  tree := COALESCE((newj->>'tree_id')::uuid,(oldj->>'tree_id')::uuid);
  INSERT INTO audit.events(actor_user_id,actor_session_id,tree_id,entity_type,entity_id,action,
    request_id,ip_address,user_agent,before_state,after_state)
  VALUES(app.current_user_id(),app.current_session_id(),tree,TG_TABLE_NAME,entity,lower(TG_OP),
    nullif(current_setting('app.request_id',true),'')::uuid,
    nullif(current_setting('app.ip',true),'')::inet,
    nullif(current_setting('app.user_agent',true),''),audit.redact(oldj),audit.redact(newj));
  RETURN COALESCE(NEW,OLD);
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','password_credentials','oauth_accounts','sessions','totp_credentials','totp_recovery_codes',
    'family_trees','tree_memberships','family_members','subfamilies',
    'parent_child_relationships','unions','union_partners','external_children','member_contacts',
    'member_media','subfamily_attachments','branch_grants','tree_share_links']
  LOOP
    EXECUTE format('CREATE TRIGGER audit_%1$I AFTER INSERT OR UPDATE OR DELETE ON app.%1$I FOR EACH ROW EXECUTE FUNCTION audit.capture_change()',t);
  END LOOP;
END $$;

ALTER TABLE app.family_trees ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.subfamilies ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.member_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tree_read ON app.family_trees FOR SELECT USING (app.can_view_tree(id));
CREATE POLICY tree_update ON app.family_trees FOR UPDATE
  USING (app.has_tree_role(id,'owner','administrator'))
  WITH CHECK (app.has_tree_role(id,'owner','administrator'));
CREATE POLICY member_read ON app.family_members FOR SELECT USING (
  app.has_tree_role(tree_id,'owner','administrator','editor','viewer') OR
  id IN (SELECT member_id FROM app.branch_members(tree_id,app.current_user_id())));
CREATE POLICY member_insert ON app.family_members FOR INSERT WITH CHECK (
  app.has_tree_role(tree_id,'owner','administrator','editor') OR
  subfamily_id IN (SELECT subfamily_id FROM app.branch_subfamilies(tree_id,app.current_user_id())));
CREATE POLICY member_update ON app.family_members FOR UPDATE
  USING (app.can_edit_member(tree_id,id)) WITH CHECK (app.can_edit_member(tree_id,id));
CREATE POLICY subfamily_read ON app.subfamilies FOR SELECT USING (
  app.has_tree_role(tree_id,'owner','administrator','editor','viewer') OR
  id IN (SELECT subfamily_id FROM app.branch_subfamilies(tree_id,app.current_user_id())));
CREATE POLICY subfamily_admin_write ON app.subfamilies FOR ALL
  USING (app.has_tree_role(tree_id,'owner','administrator'))
  WITH CHECK (app.has_tree_role(tree_id,'owner','administrator'));
CREATE POLICY contact_read ON app.member_contacts FOR SELECT USING (app.can_read_contacts(tree_id,member_id));
CREATE POLICY contact_insert ON app.member_contacts FOR INSERT WITH CHECK (app.can_write_contacts(tree_id,member_id));
CREATE POLICY contact_update ON app.member_contacts FOR UPDATE
  USING (app.can_write_contacts(tree_id,member_id)) WITH CHECK (app.can_write_contacts(tree_id,member_id));
CREATE POLICY audit_read ON audit.events FOR SELECT USING (
  tree_id IS NOT NULL AND app.has_tree_role(tree_id,'owner','administrator'));

CREATE OR REPLACE VIEW app.preview_members WITH (security_barrier=true) AS
SELECT id,tree_id,name_en,name_ar,gender,
  CASE WHEN death_date IS NULL THEN make_date(extract(year FROM birth_date)::integer,1,1) ELSE birth_date END AS birth_date,
  death_date,citizen_status,is_unknown,subfamily_id,pos_x,pos_y
FROM app.family_members WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION audit.create_month_partition(p_month date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,audit AS $$
DECLARE start_date date:=date_trunc('month',p_month)::date; end_date date; table_name text;
BEGIN
  end_date:=(start_date+interval '1 month')::date;
  table_name:='events_'||to_char(start_date,'YYYY_MM');
  EXECUTE format('CREATE TABLE IF NOT EXISTS audit.%I PARTITION OF audit.events FOR VALUES FROM (%L) TO (%L)',table_name,start_date,end_date);
END $$;

COMMIT;
