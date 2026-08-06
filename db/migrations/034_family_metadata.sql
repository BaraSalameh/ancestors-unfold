BEGIN;

ALTER TABLE app.family_trees
  ADD COLUMN country_code text,
  DROP CONSTRAINT family_trees_visibility_check,
  ADD CONSTRAINT family_trees_country_code_check
    CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT family_trees_visibility_check
    CHECK (visibility IN ('private', 'public'));

COMMIT;
