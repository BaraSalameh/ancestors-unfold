BEGIN;

ALTER TABLE app.email_verification_tokens
  ADD COLUMN purpose text NOT NULL DEFAULT 'registration'
    CHECK (purpose IN ('registration', 'email_change')),
  ADD COLUMN pending_email text,
  ADD COLUMN last_sent_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE app.email_verification_tokens
  ADD CONSTRAINT email_verification_pending_email_check CHECK (
    (purpose = 'registration' AND pending_email IS NULL) OR
    (purpose = 'email_change' AND pending_email IS NOT NULL AND pending_email = lower(btrim(pending_email)) AND position('@' IN pending_email) > 1)
  );

CREATE INDEX email_verification_active_user_idx
  ON app.email_verification_tokens(user_id, purpose, created_at DESC)
  WHERE consumed_at IS NULL AND invalidated_at IS NULL;

COMMIT;
