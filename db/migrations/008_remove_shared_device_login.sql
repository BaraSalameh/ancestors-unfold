BEGIN;

DROP TABLE app.device_login_challenges;

ALTER TABLE app.sessions DROP COLUMN session_kind;

DELETE FROM app.auth_attempts WHERE attempt_type='device_login';

ALTER TABLE app.auth_attempts DROP CONSTRAINT auth_attempts_attempt_type_check;
ALTER TABLE app.auth_attempts ADD CONSTRAINT auth_attempts_attempt_type_check
  CHECK (attempt_type IN ('login', 'password_reset', 'totp', 'recovery_code', 'email_verification'));

COMMIT;
