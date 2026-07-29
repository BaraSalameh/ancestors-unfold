BEGIN;

ALTER TABLE app.email_verification_tokens
  DROP CONSTRAINT email_verification_tokens_purpose_check,
  DROP CONSTRAINT email_verification_pending_email_check;

ALTER TABLE app.email_verification_tokens
  ADD CONSTRAINT email_verification_tokens_purpose_check CHECK (
    purpose IN ('registration','email_change','account_deletion')
  ),
  ADD CONSTRAINT email_verification_pending_email_check CHECK (
    (purpose IN ('registration','account_deletion') AND pending_email IS NULL) OR
    (
      purpose='email_change'
      AND pending_email IS NOT NULL
      AND pending_email=lower(btrim(pending_email))
      AND position('@' IN pending_email)>1
    )
  );

COMMIT;
