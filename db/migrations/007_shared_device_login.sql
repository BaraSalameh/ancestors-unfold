BEGIN;

ALTER TABLE app.sessions
  ADD COLUMN session_kind text NOT NULL DEFAULT 'normal'
    CHECK (session_kind IN ('normal', 'shared_device'));

CREATE TABLE app.device_login_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_token_hash bytea NOT NULL UNIQUE CHECK (octet_length(approval_token_hash) = 32),
  polling_token_hash bytea NOT NULL UNIQUE CHECK (octet_length(polling_token_hash) = 32),
  short_code_hash bytea NOT NULL UNIQUE CHECK (octet_length(short_code_hash) = 32),
  user_id uuid REFERENCES app.users(id) ON DELETE RESTRICT,
  requested_ip inet,
  requested_user_agent text,
  expires_at timestamptz NOT NULL,
  approved_at timestamptz,
  denied_at timestamptz,
  canceled_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (num_nonnulls(approved_at, denied_at, canceled_at) <= 1),
  CHECK (approved_at IS NULL OR user_id IS NOT NULL),
  CHECK (consumed_at IS NULL OR approved_at IS NOT NULL)
);

CREATE INDEX device_login_challenges_expiry_idx
  ON app.device_login_challenges(expires_at)
  WHERE consumed_at IS NULL AND denied_at IS NULL AND canceled_at IS NULL;

ALTER TABLE app.auth_attempts DROP CONSTRAINT auth_attempts_attempt_type_check;
ALTER TABLE app.auth_attempts ADD CONSTRAINT auth_attempts_attempt_type_check
  CHECK (attempt_type IN ('login', 'device_login', 'password_reset', 'totp', 'recovery_code', 'email_verification'));

COMMIT;
