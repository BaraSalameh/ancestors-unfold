BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.family_members WHERE gender='unspecified') THEN
    RAISE EXCEPTION 'Cannot enable binary gender: family members with unspecified gender must be corrected first';
  END IF;
  IF EXISTS (SELECT 1 FROM app.users WHERE profile_gender='unspecified') THEN
    RAISE EXCEPTION 'Cannot enable binary gender: accounts with unspecified gender must be corrected first';
  END IF;
END $$;

UPDATE app.family_members
SET citizen_status='resident'
WHERE citizen_status IS NULL;

ALTER TABLE app.family_members
  ALTER COLUMN citizen_status SET DEFAULT 'resident',
  ALTER COLUMN citizen_status SET NOT NULL,
  ADD CONSTRAINT family_members_binary_gender_check
    CHECK (gender IN ('male'::app.gender,'female'::app.gender));

ALTER TABLE app.users
  ALTER COLUMN profile_gender DROP DEFAULT,
  ALTER COLUMN profile_gender DROP NOT NULL,
  ADD CONSTRAINT users_binary_profile_gender_check
    CHECK (profile_gender IS NULL OR profile_gender IN ('male'::app.gender,'female'::app.gender));

WITH normalized AS (
  SELECT id,definition,
    coalesce((
      SELECT jsonb_agg(to_jsonb(value))
      FROM jsonb_array_elements_text(coalesce(definition#>'{filters,genders}','[]'::jsonb)) AS gender(value)
      WHERE value IN ('male','female')
    ),'[]'::jsonb) genders,
    coalesce((
      SELECT jsonb_agg(to_jsonb(value))
      FROM jsonb_array_elements_text(coalesce(definition#>'{filters,citizenStatuses}','[]'::jsonb)) AS citizenship(value)
      WHERE value IN ('resident','non_resident')
    ),'[]'::jsonb) citizen_statuses
  FROM app.analysis_saved_views
)
UPDATE app.analysis_saved_views views
SET definition=jsonb_set(
  normalized.definition,
  '{filters}',
  (coalesce(normalized.definition->'filters','{}'::jsonb)-'genders'-'citizenStatuses')
    || CASE WHEN jsonb_array_length(normalized.genders)>0
      THEN jsonb_build_object('genders',normalized.genders) ELSE '{}'::jsonb END
    || CASE WHEN jsonb_array_length(normalized.citizen_statuses)>0
      THEN jsonb_build_object('citizenStatuses',normalized.citizen_statuses) ELSE '{}'::jsonb END
)
FROM normalized
WHERE views.id=normalized.id
  AND (
    normalized.definition#>'{filters,genders}' IS NOT NULL
    OR normalized.definition#>'{filters,citizenStatuses}' IS NOT NULL
  );

CREATE OR REPLACE FUNCTION app.branch_members_for_root(p_tree uuid,p_root uuid)
RETURNS TABLE(member_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
  WITH RECURSIVE authorized_root(id) AS (
    SELECT s.id FROM app.subfamilies s
    WHERE s.tree_id=p_tree AND s.id=p_root AND s.deleted_at IS NULL
      AND (
        app.has_tree_role(p_tree,'owner','administrator','editor')
        OR s.id IN (
          SELECT subfamily_id FROM app.branch_subfamilies(p_tree,app.current_user_id())
        )
      )
  ), allowed_sf(id,linked_male_id) AS (
    SELECT s.id,s.linked_male_id FROM app.subfamilies s JOIN authorized_root r ON r.id=s.id
    UNION
    SELECT s.id,s.linked_male_id FROM app.subfamilies s JOIN allowed_sf p ON p.id=s.parent_subfamily_id
    WHERE s.tree_id=p_tree AND s.deleted_at IS NULL
  ), descendants(id) AS (
    SELECT linked_male_id FROM allowed_sf WHERE linked_male_id IS NOT NULL
    UNION
    SELECT r.child_id FROM app.parent_child_relationships r JOIN descendants d ON r.parent_id=d.id
    WHERE r.tree_id=p_tree AND r.deleted_at IS NULL
  ), direct_members(id) AS (
    SELECT m.id FROM app.family_members m JOIN allowed_sf s ON s.id=m.subfamily_id
    WHERE m.tree_id=p_tree AND m.deleted_at IS NULL
  )
  SELECT id FROM descendants UNION SELECT id FROM direct_members
$$;

REVOKE ALL ON FUNCTION app.branch_members_for_root(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.branch_members_for_root(uuid,uuid) TO ancestors_app;

COMMIT;
