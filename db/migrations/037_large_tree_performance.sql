BEGIN;

-- Large imports previously expanded the same recursive ancestry graph twice.
-- Materialize it once inside the serialized snapshot transaction so branch
-- reconciliation remains proportional to the tree rather than branch count.
CREATE OR REPLACE FUNCTION app.reconcile_branch_structure(p_tree uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,app AS $$
BEGIN
  DROP TABLE IF EXISTS pg_temp.branch_ancestry;
  CREATE TEMP TABLE branch_ancestry ON COMMIT DROP AS
  WITH RECURSIVE ancestry(member_id,ancestor_id,distance,path) AS (
    SELECT member.id,member.id,0,ARRAY[member.id]
    FROM app.family_members member
    WHERE member.tree_id=p_tree AND member.deleted_at IS NULL
    UNION ALL
    SELECT ancestry.member_id,relationship.parent_id,ancestry.distance+1,
           ancestry.path||relationship.parent_id
    FROM ancestry
    JOIN app.parent_child_relationships relationship
      ON relationship.tree_id=p_tree
     AND relationship.child_id=ancestry.ancestor_id
     AND relationship.deleted_at IS NULL
    WHERE NOT relationship.parent_id=ANY(ancestry.path)
  )
  SELECT member_id,ancestor_id,distance FROM ancestry;

  CREATE INDEX branch_ancestry_member_distance_idx
    ON branch_ancestry(member_id,distance);
  CREATE INDEX branch_ancestry_ancestor_idx
    ON branch_ancestry(ancestor_id);

  WITH candidates AS (
    SELECT child.id child_id,parent.id parent_id,ancestry.distance,
           row_number() OVER (
             PARTITION BY child.id
             ORDER BY ancestry.distance,parent.created_at,parent.id
           ) choice
    FROM app.subfamilies child
    JOIN pg_temp.branch_ancestry ancestry
      ON ancestry.member_id=child.linked_male_id AND ancestry.distance>0
    JOIN app.subfamilies parent
      ON parent.tree_id=p_tree AND parent.linked_male_id=ancestry.ancestor_id
     AND parent.id<>child.id AND parent.status='active' AND parent.deleted_at IS NULL
    WHERE child.tree_id=p_tree AND child.status='active' AND child.deleted_at IS NULL
  ), selected AS (
    SELECT child_id,parent_id FROM candidates WHERE choice=1
  )
  UPDATE app.subfamilies branch
  SET parent_subfamily_id=projection.parent_id,updated_at=now()
  FROM (
    SELECT candidate.id,selected.parent_id
    FROM app.subfamilies candidate
    LEFT JOIN selected ON selected.child_id=candidate.id
    WHERE candidate.tree_id=p_tree AND candidate.deleted_at IS NULL
  ) projection
  WHERE branch.id=projection.id
    AND branch.parent_subfamily_id IS DISTINCT FROM projection.parent_id;

  WITH candidates AS (
    SELECT ancestry.member_id,branch.id branch_id,
           row_number() OVER (
             PARTITION BY ancestry.member_id
             ORDER BY ancestry.distance,branch.created_at,branch.id
           ) choice
    FROM pg_temp.branch_ancestry ancestry
    JOIN app.subfamilies branch
      ON branch.tree_id=p_tree AND branch.linked_male_id=ancestry.ancestor_id
     AND branch.status='active' AND branch.deleted_at IS NULL
  ), selected AS (
    SELECT member_id,branch_id FROM candidates WHERE choice=1
  )
  UPDATE app.family_members member
  SET subfamily_id=projection.branch_id,updated_at=now()
  FROM (
    SELECT candidate.id,selected.branch_id
    FROM app.family_members candidate
    LEFT JOIN selected ON selected.member_id=candidate.id
    WHERE candidate.tree_id=p_tree AND candidate.deleted_at IS NULL
  ) projection
  WHERE member.id=projection.id
    AND member.subfamily_id IS DISTINCT FROM projection.branch_id;
END $$;

REVOKE ALL ON FUNCTION app.reconcile_branch_structure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reconcile_branch_structure(uuid) TO ancestors_app;

COMMIT;
