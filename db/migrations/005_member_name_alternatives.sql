BEGIN;

ALTER TABLE app.family_members
  ALTER COLUMN name_en DROP NOT NULL,
  ALTER COLUMN name_ar DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS family_members_name_en_check,
  DROP CONSTRAINT IF EXISTS family_members_name_ar_check;

ALTER TABLE app.family_members
  ADD CONSTRAINT family_members_name_present_check
  CHECK (NULLIF(btrim(name_en), '') IS NOT NULL OR NULLIF(btrim(name_ar), '') IS NOT NULL);

COMMIT;
