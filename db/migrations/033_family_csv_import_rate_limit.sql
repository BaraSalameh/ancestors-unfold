BEGIN;

ALTER TABLE app.auth_attempts
  DROP CONSTRAINT auth_attempts_attempt_type_check,
  ADD CONSTRAINT auth_attempts_attempt_type_check
    CHECK (attempt_type IN (
      'login','password_reset','totp','recovery_code','email_verification','family_csv_import'
    ));

COMMIT;
