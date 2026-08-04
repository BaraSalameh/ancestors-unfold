import type { PoolClient } from "pg";
import type { AnalysisScope, RelationshipReportData } from "../domain/types";

const relationshipReportSql = `WITH RECURSIVE scoped_ids AS (
  SELECT member.id FROM app.family_members member
  WHERE member.tree_id=$1 AND member.deleted_at IS NULL AND $3::text='tree'
  UNION
  SELECT member_id FROM app.branch_members_for_root($1,$2)
  WHERE $3::text='branch'
), scoped_members AS (
  SELECT member.* FROM app.family_members member
  JOIN scoped_ids scoped ON scoped.id=member.id
  WHERE member.tree_id=$1 AND member.deleted_at IS NULL
), report_ids AS (
  SELECT id FROM scoped_members
  UNION
  SELECT partner.member_id
  FROM app.union_partners scoped_partner
  JOIN scoped_ids scoped ON scoped.id=scoped_partner.member_id
  JOIN app.unions marriage ON marriage.id=scoped_partner.union_id
    AND marriage.tree_id=$1 AND marriage.deleted_at IS NULL
  JOIN app.union_partners partner ON partner.union_id=marriage.id AND partner.tree_id=$1
  JOIN app.family_members partner_member ON partner_member.id=partner.member_id
    AND partner_member.tree_id=$1 AND partner_member.deleted_at IS NULL
  WHERE scoped_partner.tree_id=$1
  UNION
  SELECT relationship.parent_id
  FROM app.parent_child_relationships relationship
  JOIN scoped_ids scoped_child ON scoped_child.id=relationship.child_id
  JOIN app.family_members recorded_parent ON recorded_parent.id=relationship.parent_id
    AND recorded_parent.tree_id=$1 AND recorded_parent.deleted_at IS NULL
  WHERE relationship.tree_id=$1 AND relationship.deleted_at IS NULL
), report_members AS (
  SELECT member.*,
    CASE WHEN member.birth_date IS NULL OR (member.is_deceased AND member.death_date IS NULL)
      THEN NULL
      ELSE extract(year FROM age(
        CASE WHEN member.is_deceased THEN member.death_date ELSE current_date END,
        member.birth_date
      ))::integer
    END lifecycle_age
  FROM app.family_members member JOIN report_ids report_member ON report_member.id=member.id
  WHERE member.tree_id=$1 AND member.deleted_at IS NULL
), parents AS (
  SELECT relationship.child_id,count(DISTINCT relationship.parent_id)::integer count
  FROM app.parent_child_relationships relationship
  JOIN report_ids child ON child.id=relationship.child_id
  JOIN report_ids parent ON parent.id=relationship.parent_id
  WHERE relationship.tree_id=$1 AND relationship.deleted_at IS NULL
  GROUP BY relationship.child_id
), children AS (
  SELECT relationship.parent_id,count(DISTINCT relationship.child_id)::integer count
  FROM app.parent_child_relationships relationship
  JOIN report_ids parent ON parent.id=relationship.parent_id
  JOIN report_ids child ON child.id=relationship.child_id
  WHERE relationship.tree_id=$1 AND relationship.deleted_at IS NULL
  GROUP BY relationship.parent_id
), roots AS (
  SELECT id FROM report_ids WHERE id NOT IN (SELECT child_id FROM parents)
), walk(member_id,depth,path) AS (
  SELECT id,0,ARRAY[id] FROM roots
  UNION ALL
  SELECT relationship.child_id,walk.depth+1,walk.path||relationship.child_id
  FROM walk
  JOIN app.parent_child_relationships relationship ON relationship.parent_id=walk.member_id
  JOIN report_ids child ON child.id=relationship.child_id
  WHERE relationship.tree_id=$1 AND relationship.deleted_at IS NULL AND walk.depth<100
    AND NOT relationship.child_id=ANY(walk.path)
), scoped_unions AS (
  SELECT marriage.id,marriage.status FROM app.unions marriage
  WHERE marriage.tree_id=$1 AND marriage.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM app.union_partners partner
      JOIN app.family_members active_partner ON active_partner.id=partner.member_id
        AND active_partner.tree_id=$1 AND active_partner.deleted_at IS NULL
      WHERE partner.union_id=marriage.id AND partner.tree_id=$1
        AND partner.member_id IN (SELECT id FROM report_ids)
    )
    AND NOT EXISTS (
      SELECT 1 FROM app.union_partners partner
      JOIN app.family_members active_partner ON active_partner.id=partner.member_id
        AND active_partner.tree_id=$1 AND active_partner.deleted_at IS NULL
      WHERE partner.union_id=marriage.id AND partner.tree_id=$1
        AND partner.member_id NOT IN (SELECT id FROM report_ids)
    )
    AND 2<=(
      SELECT count(DISTINCT partner.member_id) FROM app.union_partners partner
      JOIN app.family_members active_partner ON active_partner.id=partner.member_id
        AND active_partner.tree_id=$1 AND active_partner.deleted_at IS NULL
      WHERE partner.union_id=marriage.id AND partner.tree_id=$1
    )
), male_relationship_stats AS (
  SELECT member.id,member.lifecycle_age,
    EXISTS (
      SELECT 1 FROM app.union_partners partner
      JOIN scoped_unions marriage ON marriage.id=partner.union_id
      WHERE partner.tree_id=$1 AND partner.member_id=member.id AND marriage.status='current'
    ) married,
    EXISTS (
      SELECT 1 FROM app.union_partners partner
      JOIN scoped_unions marriage ON marriage.id=partner.union_id
      WHERE partner.tree_id=$1 AND partner.member_id=member.id AND marriage.status='divorced'
    ) divorced,
    EXISTS (
      SELECT 1 FROM app.union_partners partner
      JOIN app.unions recorded_union ON recorded_union.id=partner.union_id
        AND recorded_union.tree_id=$1 AND recorded_union.deleted_at IS NULL
      WHERE partner.tree_id=$1 AND partner.member_id=member.id
    ) has_recorded_union,
    EXISTS (
      SELECT 1 FROM app.parent_child_relationships relationship
      WHERE relationship.tree_id=$1 AND relationship.parent_id=member.id
        AND relationship.deleted_at IS NULL
    ) has_recorded_children
  FROM report_members member WHERE member.gender='male' AND NOT member.is_deceased
)
SELECT (SELECT count(*)::integer FROM report_ids) total_members,
  (SELECT count(*)::integer FROM app.parent_child_relationships relationship
   WHERE relationship.tree_id=$1 AND relationship.deleted_at IS NULL
     AND relationship.child_id IN (SELECT id FROM report_ids)
     AND relationship.parent_id IN (SELECT id FROM report_ids)) parent_links,
  (SELECT count(*)::integer FROM report_ids WHERE id NOT IN (SELECT child_id FROM parents)) zero_parents,
  (SELECT count(*)::integer FROM parents WHERE count=1) one_parent,
  (SELECT count(*)::integer FROM parents WHERE count>=2) two_parents,
  (SELECT count(*)::integer FROM roots) roots,
  (SELECT count(*)::integer FROM report_ids WHERE id NOT IN (SELECT parent_id FROM children)) leaves,
  (SELECT count(*)::integer FROM report_ids WHERE id NOT IN (SELECT parent_id FROM children)) no_children_recorded,
  (SELECT coalesce(max(count),0)::integer FROM children) largest_recorded_child_count,
  (SELECT count(*)::integer FROM scoped_unions) unions,
  (SELECT count(*)::integer FROM scoped_unions WHERE status='current') active_unions,
  (SELECT count(*)::integer FROM scoped_unions WHERE status='divorced') divorced_unions,
  (SELECT coalesce(max(depth),0)::integer FROM walk) maximum_generation_depth,
  (SELECT count(*) FILTER (WHERE married)::integer FROM male_relationship_stats) married_males,
  (SELECT count(*) FILTER (WHERE divorced)::integer FROM male_relationship_stats) divorced_males,
  (SELECT count(*) FILTER (WHERE NOT has_recorded_union AND lifecycle_age>=18
    AND lifecycle_age<25)::integer FROM male_relationship_stats) single_males_18_24,
  (SELECT count(*) FILTER (WHERE NOT has_recorded_union AND lifecycle_age>=25)::integer
    FROM male_relationship_stats) single_males_25_plus,
  (SELECT count(*) FILTER (WHERE married AND NOT has_recorded_children)::integer
    FROM male_relationship_stats) married_males_no_children`;

export async function readRelationshipReport(
  client: PoolClient,
  scope: AnalysisScope,
): Promise<RelationshipReportData> {
  const values = [scope.treeId, scope.branchId, scope.kind];
  const result = await client.query<RelationshipReportData>(relationshipReportSql, values);
  return result.rows[0];
}
