import type { PoolClient } from "pg";
import type { AnalysisScope, QualityReportData } from "../domain/types";
import { effectiveBranchAssignmentCtes } from "./branch-assignment-sql";

const scopedMembersCte = `
  scoped_ids AS (
    SELECT m.id FROM app.family_members m
    WHERE m.tree_id=$1 AND m.deleted_at IS NULL AND $3::text='tree'
    UNION
    SELECT member_id FROM app.branch_members_for_root($1,$2)
    WHERE $3::text='branch'
  ), scoped_members AS (
    SELECT m.* FROM app.family_members m JOIN scoped_ids s ON s.id=m.id
    WHERE m.tree_id=$1 AND m.deleted_at IS NULL
  )`;

export async function readQualityReport(
  client: PoolClient,
  scope: AnalysisScope,
): Promise<QualityReportData> {
  const result = await client.query<QualityReportData>(
    `WITH RECURSIVE ${scopedMembersCte}, ${effectiveBranchAssignmentCtes}, quality_members AS (
       SELECT member.*,assignment.branch_id effective_branch_id
       FROM scoped_members member
       LEFT JOIN branch_assignment assignment ON assignment.member_id=member.id
     ), quality_ids AS (
       SELECT id FROM quality_members
     ), wives AS (
       SELECT DISTINCT wife.member_id
       FROM app.union_partners wife
       JOIN app.unions marriage ON marriage.id=wife.union_id
         AND marriage.tree_id=$1 AND marriage.deleted_at IS NULL
       JOIN app.union_partners husband_link ON husband_link.union_id=wife.union_id
         AND husband_link.member_id<>wife.member_id
       JOIN app.family_members wife_member ON wife_member.id=wife.member_id
         AND wife_member.tree_id=$1 AND wife_member.deleted_at IS NULL
         AND wife_member.gender='female'
       JOIN app.family_members husband ON husband.id=husband_link.member_id
         AND husband.tree_id=$1 AND husband.deleted_at IS NULL
         AND husband.gender='male'
       WHERE wife.tree_id=$1 AND wife.member_id IN (SELECT id FROM scoped_ids)
     ), parent_counts AS (
       SELECT r.child_id,count(*)::integer count FROM app.parent_child_relationships r
       JOIN quality_ids child ON child.id=r.child_id
       JOIN quality_ids parent ON parent.id=r.parent_id
       WHERE r.tree_id=$1 AND r.deleted_at IS NULL
       GROUP BY r.child_id
     ), recorded_parent_roles AS (
       SELECT relationship.child_id,
         bool_or(relationship.parent_role='father') has_father,
         bool_or(relationship.parent_role='mother') has_mother
       FROM app.parent_child_relationships relationship
       JOIN quality_ids child ON child.id=relationship.child_id
       JOIN app.family_members recorded_parent ON recorded_parent.id=relationship.parent_id
         AND recorded_parent.tree_id=$1 AND recorded_parent.deleted_at IS NULL
       WHERE relationship.tree_id=$1 AND relationship.deleted_at IS NULL
       GROUP BY relationship.child_id
     ), duplicates AS (
       SELECT lower(coalesce(name_en,'')||'|'||coalesce(name_ar,'')) names,birth_date
       FROM quality_members
       WHERE birth_date IS NOT NULL
         AND (nullif(btrim(name_en),'') IS NOT NULL OR nullif(btrim(name_ar),'') IS NOT NULL)
       GROUP BY 1,2 HAVING count(*)>1
     ), cycle_walk(start_id,member_id,path,cycle,depth) AS (
       SELECT id,id,ARRAY[id],false,0 FROM quality_ids
       UNION ALL
       SELECT w.start_id,r.child_id,w.path||r.child_id,r.child_id=ANY(w.path),w.depth+1
       FROM cycle_walk w JOIN app.parent_child_relationships r ON r.parent_id=w.member_id
       JOIN quality_ids child ON child.id=r.child_id
       WHERE r.tree_id=$1 AND r.deleted_at IS NULL AND NOT w.cycle AND w.depth<100
     )
     SELECT count(*)::integer total,
       count(*) FILTER (WHERE nullif(btrim(name_en),'') IS NULL)::integer missing_name_en,
       count(*) FILTER (WHERE nullif(btrim(name_ar),'') IS NULL)::integer missing_name_ar,
       count(*) FILTER (WHERE birth_date IS NULL)::integer missing_birth_date,
       count(*) FILTER (
         WHERE $3::text='tree' AND effective_branch_id IS NULL
           AND id NOT IN (SELECT member_id FROM wives)
       )::integer missing_branch,
       count(*) FILTER (WHERE image_url IS NULL)::integer missing_image,
       count(*) FILTER (WHERE is_unknown)::integer unknown_placeholders,
       (SELECT count(*)::integer FROM quality_ids WHERE id NOT IN (SELECT child_id FROM parent_counts)) no_parents_recorded,
       (SELECT count(*)::integer FROM quality_ids member
        LEFT JOIN recorded_parent_roles parents ON parents.child_id=member.id
        WHERE NOT coalesce(parents.has_father,false)
           OR NOT coalesce(parents.has_mother,false)) missing_parent,
       (SELECT count(*)::integer FROM duplicates) possible_duplicate_groups,
       ((SELECT count(*) FROM quality_members
         WHERE birth_date IS NOT NULL AND death_date IS NOT NULL AND death_date<birth_date)
        + (SELECT count(*) FROM app.parent_child_relationships r
        JOIN app.family_members child ON child.id=r.child_id
        JOIN app.family_members parent ON parent.id=r.parent_id
        JOIN quality_ids quality_child ON quality_child.id=r.child_id
        JOIN quality_ids quality_parent ON quality_parent.id=r.parent_id
        WHERE r.tree_id=$1 AND r.deleted_at IS NULL
          AND child.birth_date IS NOT NULL AND parent.birth_date IS NOT NULL
          AND parent.birth_date>=child.birth_date))::integer contradictory_dates,
       (SELECT count(DISTINCT start_id)::integer FROM cycle_walk WHERE cycle) graph_cycles
     FROM quality_members`,
    [scope.treeId, scope.branchId, scope.kind],
  );
  return result.rows[0];
}
