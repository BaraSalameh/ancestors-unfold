BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TYPE app.user_status AS ENUM ('pending', 'active', 'suspended', 'deleted');
CREATE TYPE app.tree_role AS ENUM ('owner', 'administrator', 'editor', 'viewer');
CREATE TYPE app.branch_role AS ENUM ('branch_editor', 'branch_viewer');
CREATE TYPE app.gender AS ENUM ('male', 'female');
CREATE TYPE app.citizen_status AS ENUM ('resident', 'non_resident');
CREATE TYPE app.parent_role AS ENUM ('father', 'mother');
CREATE TYPE app.union_status AS ENUM ('current', 'divorced', 'ended', 'unknown');
CREATE TYPE app.contact_type AS ENUM ('email', 'phone', 'address', 'other');
CREATE TYPE app.scan_status AS ENUM ('pending', 'clean', 'rejected', 'failed');
CREATE TYPE app.audit_outcome AS ENUM ('success', 'failure', 'denied');

CREATE TABLE app.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  email_verified_at timestamptz,
  full_name_en text NOT NULL CHECK (btrim(full_name_en) <> ''),
  full_name_ar text NOT NULL CHECK (btrim(full_name_ar) <> ''),
  status app.user_status NOT NULL DEFAULT 'pending',
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'ar')),
  timezone text NOT NULL DEFAULT 'UTC',
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (email = lower(btrim(email))),
  CHECK (position('@' IN email) > 1),
  CHECK ((status = 'deleted') = (deleted_at IS NOT NULL))
);
CREATE UNIQUE INDEX users_email_uq ON app.users (email);

CREATE TABLE app.password_credentials (
  user_id uuid PRIMARY KEY REFERENCES app.users(id) ON DELETE RESTRICT,
  password_hash text NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
  credential_version integer NOT NULL DEFAULT 1 CHECK (credential_version > 0),
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.oauth_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (btrim(provider) <> ''),
  provider_account_id text NOT NULL CHECK (btrim(provider_account_id) <> ''),
  provider_email text,
  provider_email_verified boolean NOT NULL DEFAULT false,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(profile) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_account_id),
  UNIQUE (user_id, provider)
);
CREATE INDEX oauth_accounts_user_idx ON app.oauth_accounts(user_id);

CREATE TABLE app.email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  requested_ip inet,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (num_nonnulls(consumed_at, invalidated_at) <= 1)
);

CREATE TABLE app.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  requested_ip inet,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (num_nonnulls(consumed_at, invalidated_at) <= 1)
);

CREATE TABLE app.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  credential_version integer NOT NULL CHECK (credential_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revocation_reason text,
  ip_address inet,
  user_agent text,
  CHECK (idle_expires_at > created_at),
  CHECK (absolute_expires_at >= idle_expires_at),
  CHECK ((revoked_at IS NULL) = (revocation_reason IS NULL))
);
CREATE INDEX sessions_user_idx ON app.sessions(user_id);
CREATE INDEX sessions_active_expiry_idx ON app.sessions(absolute_expires_at) WHERE revoked_at IS NULL;

CREATE TABLE app.totp_credentials (
  user_id uuid PRIMARY KEY REFERENCES app.users(id) ON DELETE RESTRICT,
  encrypted_secret bytea NOT NULL,
  encryption_key_version integer NOT NULL CHECK (encryption_key_version > 0),
  pending_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  enabled_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((confirmed_at IS NULL AND enabled_at IS NULL) OR
         (confirmed_at IS NOT NULL AND enabled_at IS NOT NULL)),
  CHECK (disabled_at IS NULL OR enabled_at IS NOT NULL)
);

CREATE TABLE app.totp_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  code_hash bytea NOT NULL CHECK (octet_length(code_hash) = 32),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code_hash)
);

CREATE TABLE app.auth_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  attempt_type text NOT NULL CHECK (attempt_type IN ('login', 'password_reset', 'totp', 'recovery_code', 'email_verification')),
  identifier_hash bytea CHECK (identifier_hash IS NULL OR octet_length(identifier_hash) = 32),
  ip_address inet,
  succeeded boolean NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_attempts_rate_limit_idx ON app.auth_attempts(attempt_type, identifier_hash, occurred_at DESC);
CREATE INDEX auth_attempts_ip_idx ON app.auth_attempts(ip_address, occurred_at DESC);

CREATE TABLE app.family_trees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  name_en text NOT NULL CHECK (btrim(name_en) <> ''),
  name_ar text,
  description_en text,
  description_ar text,
  color text,
  theme_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(theme_metadata) = 'object'),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility = 'private'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (id, owner_user_id)
);

CREATE TABLE app.tree_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id uuid NOT NULL REFERENCES app.family_trees(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  role app.tree_role NOT NULL,
  invited_by uuid REFERENCES app.users(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES app.users(id) ON DELETE RESTRICT,
  CHECK (expires_at IS NULL OR expires_at > granted_at),
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);
CREATE UNIQUE INDEX tree_memberships_active_user_uq ON app.tree_memberships(tree_id, user_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX tree_memberships_one_owner_uq ON app.tree_memberships(tree_id) WHERE role = 'owner' AND revoked_at IS NULL;
CREATE INDEX tree_memberships_user_idx ON app.tree_memberships(user_id, tree_id) WHERE revoked_at IS NULL;

CREATE TABLE app.files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_provider text NOT NULL CHECK (btrim(storage_provider) <> ''),
  object_key text NOT NULL CHECK (btrim(object_key) <> ''),
  original_name text NOT NULL CHECK (btrim(original_name) <> ''),
  media_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  checksum_sha256 bytea NOT NULL CHECK (octet_length(checksum_sha256) = 32),
  uploaded_by uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  scan_status app.scan_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (storage_provider, object_key)
);

CREATE TABLE app.family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id uuid NOT NULL REFERENCES app.family_trees(id) ON DELETE RESTRICT,
  name_en text NOT NULL CHECK (btrim(name_en) <> ''),
  name_ar text NOT NULL CHECK (btrim(name_ar) <> ''),
  gender app.gender NOT NULL,
  birth_date date,
  death_date date,
  citizen_status app.citizen_status,
  image_file_id uuid REFERENCES app.files(id) ON DELETE RESTRICT,
  notes text,
  is_unknown boolean NOT NULL DEFAULT false,
  pos_x double precision CHECK (pos_x IS NULL OR pos_x NOT IN ('Infinity'::float8, '-Infinity'::float8) AND pos_x <> 'NaN'::float8),
  pos_y double precision CHECK (pos_y IS NULL OR pos_y NOT IN ('Infinity'::float8, '-Infinity'::float8) AND pos_y <> 'NaN'::float8),
  created_by uuid REFERENCES app.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES app.users(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tree_id, id),
  CHECK (death_date IS NULL OR birth_date IS NULL OR death_date >= birth_date)
);
CREATE INDEX family_members_tree_active_idx ON app.family_members(tree_id) WHERE deleted_at IS NULL;
CREATE INDEX family_members_name_en_trgm_idx ON app.family_members USING gin(name_en gin_trgm_ops);
CREATE INDEX family_members_name_ar_trgm_idx ON app.family_members USING gin(name_ar gin_trgm_ops);

CREATE TABLE app.subfamilies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id uuid NOT NULL REFERENCES app.family_trees(id) ON DELETE RESTRICT,
  parent_subfamily_id uuid,
  linked_male_id uuid,
  name_en text NOT NULL CHECK (btrim(name_en) <> ''),
  name_ar text,
  notes text,
  color text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tree_id, id),
  FOREIGN KEY (tree_id, parent_subfamily_id) REFERENCES app.subfamilies(tree_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tree_id, linked_male_id) REFERENCES app.family_members(tree_id, id) ON DELETE RESTRICT,
  CHECK (parent_subfamily_id IS NULL OR parent_subfamily_id <> id)
);
CREATE INDEX subfamilies_parent_idx ON app.subfamilies(tree_id, parent_subfamily_id) WHERE deleted_at IS NULL;
CREATE INDEX subfamilies_linked_male_idx ON app.subfamilies(tree_id, linked_male_id) WHERE deleted_at IS NULL;

ALTER TABLE app.family_members ADD COLUMN subfamily_id uuid;
ALTER TABLE app.family_members ADD CONSTRAINT family_members_subfamily_fk
  FOREIGN KEY (tree_id, subfamily_id) REFERENCES app.subfamilies(tree_id, id) ON DELETE RESTRICT;
CREATE INDEX family_members_subfamily_idx ON app.family_members(tree_id, subfamily_id) WHERE deleted_at IS NULL;

CREATE TABLE app.parent_child_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id uuid NOT NULL REFERENCES app.family_trees(id) ON DELETE RESTRICT,
  child_id uuid NOT NULL,
  parent_id uuid NOT NULL,
  parent_role app.parent_role NOT NULL,
  created_by uuid REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  FOREIGN KEY (tree_id, child_id) REFERENCES app.family_members(tree_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tree_id, parent_id) REFERENCES app.family_members(tree_id, id) ON DELETE RESTRICT,
  CHECK (child_id <> parent_id)
);
CREATE UNIQUE INDEX parent_child_one_role_uq ON app.parent_child_relationships(tree_id, child_id, parent_role) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX parent_child_pair_uq ON app.parent_child_relationships(tree_id, child_id, parent_id) WHERE deleted_at IS NULL;
CREATE INDEX parent_child_parent_idx ON app.parent_child_relationships(tree_id, parent_id) WHERE deleted_at IS NULL;

CREATE TABLE app.unions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id uuid NOT NULL REFERENCES app.family_trees(id) ON DELETE RESTRICT,
  status app.union_status NOT NULL DEFAULT 'current',
  started_on date,
  ended_on date,
  notes text,
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  created_by uuid REFERENCES app.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES app.users(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tree_id, id),
  CHECK (ended_on IS NULL OR started_on IS NULL OR ended_on >= started_on)
);
CREATE INDEX unions_tree_idx ON app.unions(tree_id) WHERE deleted_at IS NULL;

CREATE TABLE app.union_partners (
  union_id uuid NOT NULL,
  tree_id uuid NOT NULL,
  member_id uuid NOT NULL,
  display_order smallint NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (union_id, member_id),
  UNIQUE (union_id, display_order),
  FOREIGN KEY (tree_id, union_id) REFERENCES app.unions(tree_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tree_id, member_id) REFERENCES app.family_members(tree_id, id) ON DELETE RESTRICT
);
CREATE INDEX union_partners_member_idx ON app.union_partners(tree_id, member_id);

CREATE TABLE app.external_children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id uuid NOT NULL REFERENCES app.family_trees(id) ON DELETE RESTRICT,
  mother_id uuid NOT NULL,
  name text NOT NULL CHECK (btrim(name) <> ''),
  other_parent_name text,
  birth_year smallint CHECK (birth_year BETWEEN 1 AND 9999),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  FOREIGN KEY (tree_id, mother_id) REFERENCES app.family_members(tree_id, id) ON DELETE RESTRICT
);
CREATE INDEX external_children_mother_idx ON app.external_children(tree_id, mother_id) WHERE deleted_at IS NULL;

CREATE TABLE app.member_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id uuid NOT NULL REFERENCES app.family_trees(id) ON DELETE RESTRICT,
  member_id uuid NOT NULL,
  contact_type app.contact_type NOT NULL,
  normalized_value text,
  display_value text NOT NULL CHECK (btrim(display_value) <> ''),
  label text,
  address jsonb CHECK (address IS NULL OR jsonb_typeof(address) = 'object'),
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_by uuid REFERENCES app.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  FOREIGN KEY (tree_id, member_id) REFERENCES app.family_members(tree_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX member_contacts_primary_uq ON app.member_contacts(member_id, contact_type) WHERE is_primary AND deleted_at IS NULL;
CREATE INDEX member_contacts_member_idx ON app.member_contacts(tree_id, member_id) WHERE deleted_at IS NULL;

CREATE TABLE app.member_media (
  member_id uuid NOT NULL,
  tree_id uuid NOT NULL,
  file_id uuid NOT NULL REFERENCES app.files(id) ON DELETE RESTRICT,
  title text NOT NULL,
  media_kind text NOT NULL DEFAULT 'document',
  description text,
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  preview_safe boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, file_id),
  FOREIGN KEY (tree_id, member_id) REFERENCES app.family_members(tree_id, id) ON DELETE RESTRICT
);

CREATE TABLE app.subfamily_attachments (
  subfamily_id uuid NOT NULL,
  tree_id uuid NOT NULL,
  file_id uuid NOT NULL REFERENCES app.files(id) ON DELETE RESTRICT,
  title text NOT NULL,
  attachment_type text NOT NULL DEFAULT 'document',
  description text,
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  preview_safe boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subfamily_id, file_id),
  FOREIGN KEY (tree_id, subfamily_id) REFERENCES app.subfamilies(tree_id, id) ON DELETE RESTRICT
);

CREATE TABLE app.branch_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  tree_id uuid NOT NULL REFERENCES app.family_trees(id) ON DELETE RESTRICT,
  root_subfamily_id uuid NOT NULL,
  role app.branch_role NOT NULL,
  can_read_contacts boolean NOT NULL DEFAULT false,
  can_write_contacts boolean NOT NULL DEFAULT false,
  granted_by uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES app.users(id) ON DELETE RESTRICT,
  FOREIGN KEY (tree_id, root_subfamily_id) REFERENCES app.subfamilies(tree_id, id) ON DELETE RESTRICT,
  CHECK (expires_at IS NULL OR expires_at > granted_at),
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CHECK (NOT can_write_contacts OR can_read_contacts)
);
CREATE UNIQUE INDEX branch_grants_active_uq ON app.branch_grants(user_id, tree_id, root_subfamily_id, role) WHERE revoked_at IS NULL;
CREATE INDEX branch_grants_user_idx ON app.branch_grants(user_id, tree_id) WHERE revoked_at IS NULL;

CREATE TABLE app.tree_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id uuid NOT NULL REFERENCES app.family_trees(id) ON DELETE RESTRICT,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  created_by uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  usage_limit integer CHECK (usage_limit IS NULL OR usage_limit > 0),
  usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  CHECK (expires_at > created_at),
  CHECK (usage_limit IS NULL OR usage_count <= usage_limit)
);
CREATE INDEX tree_share_links_tree_idx ON app.tree_share_links(tree_id) WHERE revoked_at IS NULL;

CREATE TABLE audit.events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  actor_session_id uuid,
  tree_id uuid,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  outcome app.audit_outcome NOT NULL DEFAULT 'success',
  request_id uuid,
  correlation_id uuid,
  ip_address inet,
  user_agent text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  PRIMARY KEY (occurred_at, id)
) PARTITION BY RANGE (occurred_at);

-- A default partition prevents writes from failing before the monthly partition job runs.
CREATE TABLE audit.events_default PARTITION OF audit.events DEFAULT;
CREATE INDEX audit_events_actor_idx ON audit.events(actor_user_id, occurred_at DESC);
CREATE INDEX audit_events_tree_idx ON audit.events(tree_id, occurred_at DESC);
CREATE INDEX audit_events_entity_idx ON audit.events(entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_events_action_idx ON audit.events(action, occurred_at DESC);
CREATE INDEX audit_events_correlation_idx ON audit.events(correlation_id) WHERE correlation_id IS NOT NULL;

CREATE TABLE app.import_id_map (
  import_batch_id uuid NOT NULL,
  entity_type text NOT NULL,
  source_id text NOT NULL,
  target_id uuid,
  status text NOT NULL CHECK (status IN ('mapped', 'quarantined', 'skipped')),
  issue jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (import_batch_id, entity_type, source_id)
);

COMMIT;
