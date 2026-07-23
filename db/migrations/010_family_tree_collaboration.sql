BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT user_id FROM (
      SELECT user_id,tree_id FROM app.tree_memberships
      UNION ALL
      SELECT user_id,tree_id FROM app.branch_grants
      WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())
    ) affiliations
    GROUP BY user_id HAVING count(DISTINCT tree_id) > 1
  ) THEN
    RAISE EXCEPTION 'migration 009 requires manual resolution of users affiliated with multiple trees';
  END IF;
  IF EXISTS (
    SELECT user_id FROM app.tree_memberships GROUP BY user_id HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'migration 009 requires consolidation of duplicate membership history';
  END IF;
END $$;

CREATE TYPE app.affiliation_status AS ENUM ('active', 'read_only', 'removed');
CREATE TYPE app.branch_status AS ENUM ('active', 'inactive');
CREATE TYPE app.invitation_status AS ENUM
  ('pending', 'accepted', 'expired', 'cancelled', 'invalidated', 'rejected');
CREATE TYPE app.transfer_status AS ENUM ('pending', 'accepted', 'rejected', 'cancelled', 'expired');
CREATE TYPE app.request_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
CREATE TYPE app.complaint_category AS ENUM
  ('fake_tree', 'impersonation', 'incorrect_relationship', 'privacy', 'abusive_content', 'spam', 'other');
CREATE TYPE app.complaint_status AS ENUM ('open', 'resolved', 'dismissed');
CREATE TYPE app.authenticity_level AS ENUM ('new', 'growing', 'family_backed', 'established');

ALTER TABLE app.tree_memberships
  ADD COLUMN affiliation_status app.affiliation_status NOT NULL DEFAULT 'active',
  ADD COLUMN family_member_id uuid;

CREATE UNIQUE INDEX tree_memberships_one_tree_per_user_uq ON app.tree_memberships(user_id);

ALTER TABLE app.family_members
  ADD COLUMN linked_user_id uuid REFERENCES app.users(id) ON DELETE RESTRICT,
  ADD COLUMN position_label text;

CREATE UNIQUE INDEX family_members_linked_user_uq
  ON app.family_members(linked_user_id) WHERE linked_user_id IS NOT NULL;

ALTER TABLE app.tree_memberships
  ADD CONSTRAINT tree_memberships_family_member_fk
  FOREIGN KEY (tree_id, family_member_id)
  REFERENCES app.family_members(tree_id, id) DEFERRABLE INITIALLY DEFERRED;

INSERT INTO app.tree_memberships(tree_id,user_id,role)
SELECT DISTINCT g.tree_id,g.user_id,'viewer'::app.tree_role
FROM app.branch_grants g
WHERE g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>now())
  AND NOT EXISTS (SELECT 1 FROM app.tree_memberships m WHERE m.user_id=g.user_id);

WITH missing AS (
  SELECT u.id,u.full_name_en,u.full_name_ar
  FROM app.users u
  WHERE u.status='active'
    AND NOT EXISTS (SELECT 1 FROM app.tree_memberships m WHERE m.user_id=u.id)
), created AS (
  INSERT INTO app.family_trees(owner_user_id,name_en,name_ar)
  SELECT id,full_name_en||'''s Family Tree','شجرة عائلة '||full_name_ar FROM missing
  RETURNING id,owner_user_id
)
INSERT INTO app.tree_memberships(tree_id,user_id,role)
SELECT id,owner_user_id,'owner' FROM created;

INSERT INTO app.family_members(
  tree_id,name_en,name_ar,gender,linked_user_id,position_label,created_by,updated_by
)
SELECT m.tree_id,u.full_name_en,u.full_name_ar,'unspecified',u.id,
  CASE WHEN m.role='owner' THEN 'Tree owner' ELSE 'Family contributor' END,u.id,u.id
FROM app.tree_memberships m JOIN app.users u ON u.id=m.user_id
WHERE m.family_member_id IS NULL;

UPDATE app.tree_memberships m SET family_member_id=f.id
FROM app.family_members f
WHERE f.linked_user_id=m.user_id AND f.tree_id=m.tree_id AND m.family_member_id IS NULL;

-- Flush the existing deferred ownership triggers before later DDL adds new triggers.
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

ALTER TABLE app.subfamilies
  ADD COLUMN status app.branch_status NOT NULL DEFAULT 'active',
  ADD COLUMN position_label text;

CREATE UNIQUE INDEX branch_grants_one_active_editor_per_branch_uq
  ON app.branch_grants(tree_id, root_subfamily_id)
  WHERE role='branch_editor' AND revoked_at IS NULL;

CREATE TABLE app.contributor_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id uuid NOT NULL REFERENCES app.family_trees(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL,
  inviter_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  invited_name_en text NOT NULL CHECK (btrim(invited_name_en) <> ''),
  invited_name_ar text NOT NULL CHECK (btrim(invited_name_ar) <> ''),
  invited_email text NOT NULL CHECK (invited_email=lower(btrim(invited_email))),
  position_label text NOT NULL CHECK (btrim(position_label) <> ''),
  existing_family_member_id uuid,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash)=32),
  status app.invitation_status NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tree_id,branch_id) REFERENCES app.subfamilies(tree_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tree_id,existing_family_member_id) REFERENCES app.family_members(tree_id,id) ON DELETE RESTRICT,
  CHECK (expires_at>created_at),
  CHECK ((status='accepted')=(accepted_at IS NOT NULL))
);
CREATE UNIQUE INDEX contributor_invitations_pending_email_uq
  ON app.contributor_invitations(invited_email) WHERE status='pending';
CREATE UNIQUE INDEX contributor_invitations_pending_branch_uq
  ON app.contributor_invitations(tree_id,branch_id) WHERE status='pending';

ALTER TABLE app.users
  ADD COLUMN registration_invitation_id uuid
  REFERENCES app.contributor_invitations(id) ON DELETE RESTRICT;

ALTER TABLE app.auth_attempts DROP CONSTRAINT auth_attempts_attempt_type_check;
ALTER TABLE app.auth_attempts ADD CONSTRAINT auth_attempts_attempt_type_check CHECK (
  attempt_type IN ('login','password_reset','totp','recovery_code','email_verification','invitation','ownership_transfer')
);

CREATE TABLE app.ownership_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id uuid NOT NULL REFERENCES app.family_trees(id) ON DELETE RESTRICT,
  current_owner_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  proposed_owner_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  previous_owner_branch_id uuid,
  keep_previous_owner_read_only boolean NOT NULL DEFAULT false,
  status app.transfer_status NOT NULL DEFAULT 'pending',
  verification_code_hash bytea CHECK (verification_code_hash IS NULL OR octet_length(verification_code_hash)=32),
  verified_at timestamptz,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tree_id,previous_owner_branch_id) REFERENCES app.subfamilies(tree_id,id) ON DELETE RESTRICT,
  CHECK (current_owner_user_id<>proposed_owner_user_id),
  CHECK (expires_at>created_at)
);
CREATE UNIQUE INDEX ownership_transfers_pending_tree_uq
  ON app.ownership_transfers(tree_id) WHERE status='pending';

CREATE TABLE app.ownership_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id uuid NOT NULL REFERENCES app.family_trees(id) ON DELETE RESTRICT,
  previous_owner_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  new_owner_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  initiated_by uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  accepted_at timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.member_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id uuid NOT NULL REFERENCES app.family_trees(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL,
  member_id uuid NOT NULL,
  requested_by uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  status app.request_status NOT NULL DEFAULT 'pending',
  proposed_changes jsonb NOT NULL CHECK (jsonb_typeof(proposed_changes)='object'),
  reviewed_by uuid REFERENCES app.users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tree_id,branch_id) REFERENCES app.subfamilies(tree_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tree_id,member_id) REFERENCES app.family_members(tree_id,id) ON DELETE RESTRICT
);

CREATE TABLE app.tree_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id uuid NOT NULL REFERENCES app.family_trees(id) ON DELETE RESTRICT,
  submitted_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  category app.complaint_category NOT NULL,
  description text NOT NULL CHECK (btrim(description) <> ''),
  serious boolean NOT NULL DEFAULT false,
  status app.complaint_status NOT NULL DEFAULT 'open',
  reviewed_by uuid REFERENCES app.users(id) ON DELETE RESTRICT,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status='open')=(resolved_at IS NULL))
);

CREATE TABLE app.authenticity_config (
  version integer PRIMARY KEY CHECK (version>0),
  growing_contributors integer NOT NULL CHECK (growing_contributors>=0),
  growing_branches integer NOT NULL CHECK (growing_branches>=0),
  backed_contributors integer NOT NULL CHECK (backed_contributors>=0),
  backed_branches integer NOT NULL CHECK (backed_branches>=0),
  established_contributors integer NOT NULL CHECK (established_contributors>=0),
  established_branches integer NOT NULL CHECK (established_branches>=0),
  established_min_days integer NOT NULL CHECK (established_min_days>=0),
  recent_activity_days integer NOT NULL CHECK (recent_activity_days>0),
  serious_complaint_downgrade boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app.authenticity_config(
  version,growing_contributors,growing_branches,backed_contributors,backed_branches,
  established_contributors,established_branches,established_min_days,recent_activity_days
) VALUES(1,2,2,4,3,8,5,365,90);

CREATE TABLE app.tree_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id uuid NOT NULL REFERENCES app.family_trees(id) ON DELETE RESTRICT,
  branch_id uuid,
  actor_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (btrim(action_type) <> ''),
  target_type text NOT NULL CHECK (btrim(target_type) <> ''),
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tree_id,branch_id) REFERENCES app.subfamilies(tree_id,id) ON DELETE RESTRICT
);
CREATE INDEX tree_activity_tree_created_idx ON app.tree_activity(tree_id,created_at DESC);

CREATE OR REPLACE FUNCTION app.validate_account_affiliation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE member_tree uuid; member_user uuid;
BEGIN
  IF NEW.family_member_id IS NULL THEN RETURN NEW; END IF;
  SELECT tree_id,linked_user_id INTO member_tree,member_user
  FROM app.family_members WHERE id=NEW.family_member_id;
  IF member_tree IS DISTINCT FROM NEW.tree_id OR member_user IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'membership card must link the same user in the same tree';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER validate_account_affiliation
AFTER INSERT OR UPDATE ON app.tree_memberships DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.validate_account_affiliation();

CREATE OR REPLACE FUNCTION app.validate_branch_grantee() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app.tree_memberships m
    WHERE m.user_id=NEW.user_id AND m.tree_id=NEW.tree_id
      AND m.affiliation_status='active'
  ) THEN RAISE EXCEPTION 'branch contributor must be actively affiliated with the same tree'; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER validate_branch_grantee
AFTER INSERT OR UPDATE ON app.branch_grants DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.validate_branch_grantee();

CREATE OR REPLACE FUNCTION app.can_view_tree(p_tree uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM app.tree_memberships m
    WHERE m.tree_id=p_tree AND m.user_id=app.current_user_id()
      AND m.affiliation_status IN ('active','read_only')
      AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>now())
  )
$$;

CREATE OR REPLACE FUNCTION app.public_invitation(p_token_hash bytea)
RETURNS TABLE(
  invited_name_en text, invited_name_ar text, position_label text, expires_at timestamptz,
  tree_name_en text, tree_name_ar text, branch_name_en text, branch_name_ar text,
  owner_name_en text, owner_name_ar text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
  SELECT i.invited_name_en,i.invited_name_ar,i.position_label,i.expires_at,
    t.name_en,t.name_ar,b.name_en,b.name_ar,u.full_name_en,u.full_name_ar
  FROM app.contributor_invitations i
  JOIN app.family_trees t ON t.id=i.tree_id AND t.deleted_at IS NULL
  JOIN app.subfamilies b ON b.id=i.branch_id AND b.status='active' AND b.deleted_at IS NULL
  JOIN app.users u ON u.id=t.owner_user_id
  WHERE i.token_hash=p_token_hash AND i.status='pending' AND i.expires_at>now()
$$;

ALTER TABLE app.contributor_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ownership_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ownership_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.member_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tree_complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tree_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY invitation_owner_access ON app.contributor_invitations FOR ALL
  USING (app.has_tree_role(tree_id,'owner','administrator'))
  WITH CHECK (app.has_tree_role(tree_id,'owner','administrator'));
CREATE POLICY invitation_invitee_update ON app.contributor_invitations FOR UPDATE
  USING (invited_email=(SELECT email FROM app.users WHERE id=app.current_user_id()))
  WITH CHECK (invited_email=(SELECT email FROM app.users WHERE id=app.current_user_id()));
CREATE POLICY transfer_participant_read ON app.ownership_transfers FOR SELECT USING (
  current_owner_user_id=app.current_user_id() OR proposed_owner_user_id=app.current_user_id()
);
CREATE POLICY transfer_owner_write ON app.ownership_transfers FOR ALL
  USING (current_owner_user_id=app.current_user_id())
  WITH CHECK (current_owner_user_id=app.current_user_id());
CREATE POLICY transfer_proposed_update ON app.ownership_transfers FOR UPDATE
  USING (proposed_owner_user_id=app.current_user_id())
  WITH CHECK (proposed_owner_user_id=app.current_user_id());
CREATE POLICY ownership_history_tree_read ON app.ownership_history FOR SELECT USING (app.can_view_tree(tree_id));
CREATE POLICY ownership_history_new_owner_insert ON app.ownership_history FOR INSERT WITH CHECK (
  new_owner_user_id=app.current_user_id()
);
CREATE POLICY change_request_tree_read ON app.member_change_requests FOR SELECT USING (app.can_view_tree(tree_id));
CREATE POLICY change_request_contributor_insert ON app.member_change_requests FOR INSERT WITH CHECK (
  requested_by=app.current_user_id() AND EXISTS (
    SELECT 1 FROM app.branch_grants g WHERE g.tree_id=tree_id
      AND g.root_subfamily_id=branch_id AND g.user_id=app.current_user_id()
      AND g.role='branch_editor' AND g.revoked_at IS NULL
  )
);
CREATE POLICY complaint_tree_read ON app.tree_complaints FOR SELECT USING (app.has_tree_role(tree_id,'owner','administrator'));
CREATE POLICY complaint_member_insert ON app.tree_complaints FOR INSERT WITH CHECK (
  submitted_by=app.current_user_id() AND app.can_view_tree(tree_id)
);
CREATE POLICY complaint_owner_update ON app.tree_complaints FOR UPDATE
  USING (app.has_tree_role(tree_id,'owner','administrator'))
  WITH CHECK (app.has_tree_role(tree_id,'owner','administrator'));
CREATE POLICY activity_tree_read ON app.tree_activity FOR SELECT USING (app.can_view_tree(tree_id));
CREATE POLICY activity_actor_insert ON app.tree_activity FOR INSERT WITH CHECK (
  actor_user_id=app.current_user_id() AND app.can_view_tree(tree_id)
);
CREATE POLICY tree_owner_insert ON app.family_trees FOR INSERT WITH CHECK (
  owner_user_id=app.current_user_id()
);
CREATE POLICY invited_member_insert ON app.family_members FOR INSERT WITH CHECK (
  linked_user_id=app.current_user_id() AND EXISTS (
    SELECT 1 FROM app.tree_memberships m
    WHERE m.tree_id=tree_id AND m.user_id=app.current_user_id()
      AND m.affiliation_status='active' AND m.revoked_at IS NULL
  )
);
CREATE POLICY invited_member_link ON app.family_members FOR UPDATE
  USING (
    linked_user_id IS NULL AND EXISTS (
      SELECT 1 FROM app.contributor_invitations i
      JOIN app.users u ON u.email=i.invited_email
      WHERE i.tree_id=family_members.tree_id
        AND i.existing_family_member_id=family_members.id
        AND i.status='pending' AND u.id=app.current_user_id()
    )
  )
  WITH CHECK (linked_user_id=app.current_user_id());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'contributor_invitations','ownership_transfers','ownership_history',
    'member_change_requests','tree_complaints','tree_activity'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER audit_%1$I AFTER INSERT OR UPDATE OR DELETE ON app.%1$I FOR EACH ROW EXECUTE FUNCTION audit.capture_change()',t
    );
  END LOOP;
END $$;

GRANT SELECT,INSERT,UPDATE ON app.contributor_invitations,app.ownership_transfers,
  app.member_change_requests,app.tree_complaints TO ancestors_app;
GRANT SELECT,INSERT ON app.ownership_history,app.tree_activity TO ancestors_app;
GRANT SELECT,INSERT ON app.authenticity_config TO ancestors_app;
GRANT EXECUTE ON FUNCTION app.public_invitation(bytea) TO ancestors_app;

COMMIT;
