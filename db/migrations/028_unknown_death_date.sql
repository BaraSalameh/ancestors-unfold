BEGIN;

ALTER TABLE app.family_members
  ADD COLUMN is_deceased boolean NOT NULL DEFAULT false;

UPDATE app.family_members
SET is_deceased=true
WHERE death_date IS NOT NULL;

ALTER TABLE app.family_members
  ADD CONSTRAINT family_members_death_status_check
  CHECK (death_date IS NULL OR is_deceased);

DROP INDEX app.family_members_analysis_active_idx;
CREATE INDEX family_members_analysis_active_idx
  ON app.family_members(tree_id,is_deceased,birth_date,death_date,gender,citizen_status)
  INCLUDE (subfamily_id,is_unknown,image_url,created_at,updated_at)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW app.preview_members WITH (security_barrier=true) AS
SELECT id,tree_id,name_en,name_ar,gender,
  CASE WHEN is_deceased THEN birth_date
    ELSE make_date(extract(year FROM birth_date)::integer,1,1) END AS birth_date,
  death_date,citizen_status,is_unknown,subfamily_id,pos_x,pos_y,is_deceased
FROM app.family_members WHERE deleted_at IS NULL;

COMMIT;
