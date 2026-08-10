BEGIN;

ALTER TABLE app.branch_deactivation_challenges
  ADD COLUMN branch_ids uuid[];

ALTER TABLE app.branch_deactivation_challenges
  ADD CONSTRAINT branch_deactivation_challenges_branch_ids_check
  CHECK (
    branch_ids IS NULL OR (
      cardinality(branch_ids) BETWEEN 1 AND 100
      AND branch_id=ANY(branch_ids)
    )
  );

COMMIT;
