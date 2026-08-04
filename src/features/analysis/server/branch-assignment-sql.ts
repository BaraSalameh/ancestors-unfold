export const effectiveBranchAssignmentCtes = `
  branch_tree(id,name_en,name_ar,parent_subfamily_id,linked_male_id,depth) AS (
    SELECT b.id,b.name_en,b.name_ar,b.parent_subfamily_id,b.linked_male_id,0
    FROM app.subfamilies b
    WHERE b.tree_id=$1 AND b.deleted_at IS NULL AND b.parent_subfamily_id IS NULL
    UNION ALL
    SELECT b.id,b.name_en,b.name_ar,b.parent_subfamily_id,b.linked_male_id,parent.depth+1
    FROM app.subfamilies b JOIN branch_tree parent ON parent.id=b.parent_subfamily_id
    WHERE b.tree_id=$1 AND b.deleted_at IS NULL
  ), branch_lineage(branch_id,member_id,path) AS (
    SELECT id,linked_male_id,ARRAY[linked_male_id]
    FROM branch_tree WHERE linked_male_id IS NOT NULL
    UNION ALL
    SELECT lineage.branch_id,relationship.child_id,lineage.path||relationship.child_id
    FROM branch_lineage lineage
    JOIN app.parent_child_relationships relationship ON relationship.parent_id=lineage.member_id
    WHERE relationship.tree_id=$1 AND relationship.deleted_at IS NULL
      AND NOT relationship.child_id=ANY(lineage.path)
  ), branch_candidates AS (
    SELECT member.id member_id,branch.id branch_id,branch.name_en,branch.name_ar,
      branch.depth,true direct_assignment
    FROM scoped_members member JOIN branch_tree branch ON branch.id=member.subfamily_id
    UNION
    SELECT lineage.member_id,branch.id,branch.name_en,branch.name_ar,
      branch.depth,false direct_assignment
    FROM branch_lineage lineage JOIN branch_tree branch ON branch.id=lineage.branch_id
    JOIN scoped_ids scoped ON scoped.id=lineage.member_id
  ), ranked_branches AS (
    SELECT *,row_number() OVER (
      PARTITION BY member_id ORDER BY direct_assignment DESC,depth DESC,branch_id
    ) branch_rank
    FROM branch_candidates
  ), branch_assignment AS (
    SELECT member_id,branch_id,name_en,name_ar FROM ranked_branches WHERE branch_rank=1
  )`;
