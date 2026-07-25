BEGIN;

ALTER TABLE app.users
  ADD COLUMN profile_gender app.gender NOT NULL DEFAULT 'unspecified';

COMMIT;
