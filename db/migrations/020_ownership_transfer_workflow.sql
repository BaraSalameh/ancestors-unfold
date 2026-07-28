BEGIN;

ALTER TABLE app.ownership_transfers
  ADD COLUMN verification_expires_at timestamptz;

UPDATE app.ownership_transfers
SET verification_expires_at = LEAST(expires_at, created_at + interval '15 minutes')
WHERE verification_code_hash IS NOT NULL;

ALTER TABLE app.ownership_transfers
  ADD CONSTRAINT ownership_transfers_verification_expiry_check CHECK (
    verification_expires_at IS NULL
    OR (
      verification_expires_at > created_at
      AND verification_expires_at <= expires_at
    )
  );

COMMIT;
